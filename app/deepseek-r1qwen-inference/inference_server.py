"""
DeepSeek-R1-Distill-Qwen-1.5B Inference Server (GGUF)
FastAPI-based REST API using llama-cpp-python for efficient CPU inference

This mirrors the existing local servers and exposes an OpenAI-compatible
`/v1/chat/completions` endpoint so the chat-interface can call it directly.
"""

import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

app = FastAPI(
    title="DeepSeek R1 Distill Qwen 1.5B API",
    description="REST API for DeepSeek-R1-Distill-Qwen-1.5B (GGUF) via llama.cpp",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance and concurrency gate
llm = None
inference_lock = asyncio.Semaphore(1)
MODEL_NAME = "DeepSeek-R1-Distill-Qwen-1.5B"


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


def download_model() -> str:
    """Download GGUF model from Hugging Face (configurable via env)."""
    # Defaults to a popular GGUF repo; override in production if needed
    repo_id = os.getenv("MODEL_REPO", "bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF")
    filename = os.getenv("MODEL_FILE", "DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf")

    print(f"Downloading model: {repo_id}/{filename}")
    model_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        cache_dir=os.getenv("HF_HOME", "/tmp/hf_cache")
    )
    print(f"Model downloaded to: {model_path}")
    return model_path


def load_model():
    """Load the GGUF model into llama.cpp bindings."""
    global llm

    model_path = download_model()
    n_ctx = int(os.getenv("N_CTX", "4096"))
    n_threads = int(os.getenv("N_THREADS", "2"))

    print(f"Loading model with n_ctx={n_ctx}, n_threads={n_threads}")
    llm = Llama(
        model_path=model_path,
        n_ctx=n_ctx,
        n_threads=n_threads,
        use_mlock=True,
        use_mmap=True,
        n_batch=512,
        last_n_tokens_size=64,
        verbose=True,
    )
    print("Model loaded successfully!")

    # Warm up the model with a tiny inference
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
async def startup_event():
    load_model()


@app.get("/health")
async def health():
    return {
        "status": "healthy" if llm is not None else "loading",
        "model": MODEL_NAME,
        "format": "GGUF",
    }


@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {"id": "deepseek-r1-distill-qwen-1.5b", "object": "model", "owned_by": "deepseek"}
        ]
    }


async def generate_stream(messages: list, max_tokens: int, temperature: float, top_p: float):
    """Yield Server-Sent Events chunks compatible with OpenAI stream format."""
    global llm
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

            # Compute token usage post-generation
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
    global llm
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
                generate_stream(messages, request.max_tokens, request.temperature, request.top_p),
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
            "id": "chatcmpl-r1qwen",
            "object": "chat.completion",
            "model": "deepseek-r1-distill-qwen-1.5b",
            "choices": response["choices"],
            "usage": response["usage"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
