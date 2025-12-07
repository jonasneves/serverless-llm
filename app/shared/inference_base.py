"""
Shared GGUF Inference Server base

Provides a factory to create FastAPI apps for llama.cpp-backed models with
consistent APIs and streaming behavior. Model-specific servers should import
this module and supply a ModelConfig.
"""

from __future__ import annotations

import os
import json
import asyncio
from dataclasses import dataclass
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from huggingface_hub import hf_hub_download
from llama_cpp import Llama


@dataclass
class ModelConfig:
    # FastAPI metadata
    title: str
    description: str

    # Display model name for health endpoints
    model_name: str

    # OpenAI-compatible model ID in responses and /v1/models
    openai_model_id: str
    owned_by: str

    # Default HF repo + file (can be overridden via env)
    default_repo: str
    default_file: str

    # llama.cpp tuning
    default_n_ctx: int = 2048
    default_n_threads: int = 2
    n_batch: int = 256
    last_n_tokens_size: int = 64


class ChatMessage(BaseModel):
    role: str
    content: str


class GenerateRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    stream: bool = False

    class Config:
        extra = 'ignore'  # allow OpenAI-style extra fields like 'model', 'tools', etc.


def _download_model(default_repo: str, default_file: str) -> str:
    repo_id = os.getenv("MODEL_REPO", default_repo)
    filename = os.getenv("MODEL_FILE", default_file)

    print(f"Downloading model: {repo_id}/{filename}")
    model_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        cache_dir=os.getenv("HF_HOME", "/tmp/hf_cache"),
    )
    print(f"Model downloaded to: {model_path}")
    return model_path


def create_inference_app(config: ModelConfig) -> FastAPI:
    app = FastAPI(
        title=config.title,
        description=config.description,
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Model state and concurrency gate
    llm: Optional[Llama] = None
    inference_lock = asyncio.Semaphore(1)

    def _load_model():
        nonlocal llm
        model_path = _download_model(config.default_repo, config.default_file)
        n_ctx = int(os.getenv("N_CTX", str(config.default_n_ctx)))
        n_threads = int(os.getenv("N_THREADS", str(config.default_n_threads)))
        n_batch = int(os.getenv("N_BATCH", str(config.n_batch)))

        print(f"Loading model with n_ctx={n_ctx}, n_threads={n_threads}, n_batch={n_batch}")
        llm = Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_threads=n_threads,
            use_mlock=True,
            use_mmap=True,
            n_batch=n_batch,
            last_n_tokens_size=config.last_n_tokens_size,
            verbose=True,
        )
        print("Model loaded successfully!")

        # Warm up the model with a tiny inference (non-blocking errors)
        print("Warming up model...")
        try:
            llm.create_chat_completion(
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
                temperature=0.1,
            )
            print("Model warm-up complete!")
        except Exception as e:
            print(f"Warm-up warning: {e}")

    @app.on_event("startup")
    async def _startup_event():
        _load_model()

    @app.get("/health")
    async def health():
        return {
            "status": "healthy" if llm is not None else "loading",
            "model": config.model_name,
            "format": "GGUF",
        }

    @app.get("/health/details")
    async def health_details():
        return {
            "status": "healthy" if llm is not None else "loading",
            "model": config.model_name,
            "format": "GGUF",
            "repo": os.getenv("MODEL_REPO", config.default_repo),
            "file": os.getenv("MODEL_FILE", config.default_file),
            "n_ctx": int(os.getenv("N_CTX", str(config.default_n_ctx))),
            "n_threads": int(os.getenv("N_THREADS", str(config.default_n_threads))),
            "git_sha": os.getenv("GIT_SHA", "unknown"),
        }

    @app.get("/v1/models")
    async def list_models():
        return {
            "data": [
                {"id": config.openai_model_id, "object": "model", "owned_by": config.owned_by}
            ]
        }

    async def _generate_stream(messages: list, max_tokens: int, temperature: float, top_p: float):
        nonlocal llm
        try:
            async with inference_lock:
                response = await asyncio.to_thread(
                    llm.create_chat_completion,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    stream=True,
                )

                generated_text = ""
                for chunk in response:
                    if "choices" in chunk and len(chunk["choices"]) > 0:
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            content = delta["content"]
                            generated_text += content
                            yield f"data: {json.dumps(chunk)}\n\n"
                            await asyncio.sleep(0)

                # Compute token usage
                prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
                prompt_tokens = len(llm.tokenize(prompt_text.encode()))
                completion_tokens = len(llm.tokenize(generated_text.encode()))
                total_tokens = prompt_tokens + completion_tokens

                usage_chunk = {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens,
                    },
                }
                yield f"data: {json.dumps(usage_chunk)}\n\n"
                yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    @app.post("/v1/chat/completions")
    async def chat_completions(request: GenerateRequest):
        nonlocal llm
        if llm is None:
            raise HTTPException(status_code=503, detail="Model not loaded")

        try:
            if request.messages:
                messages = [{"role": m.role, "content": m.content} for m in request.messages]
            elif request.prompt:
                messages = [{"role": "user", "content": request.prompt}]
            else:
                raise HTTPException(status_code=400, detail="Either messages or prompt required")

            if request.stream:
                return StreamingResponse(
                    _generate_stream(messages, request.max_tokens, request.temperature, request.top_p),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
                )

            async with inference_lock:
                response = await asyncio.to_thread(
                    llm.create_chat_completion,
                    messages=messages,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                    top_p=request.top_p,
                )

            return {
                "id": f"chatcmpl-{config.openai_model_id}",
                "object": "chat.completion",
                "model": config.openai_model_id,
                "choices": response["choices"],
                "usage": response["usage"],
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return app
