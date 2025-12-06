"""
GLM-4.6 Inference Server (Hugging Face Inference API)

FastAPI-based REST API exposing an OpenAI-compatible /v1/chat/completions
endpoint by calling the Hugging Face Inference API for model zai-org/GLM-4.6.

Notes:
- Requires HF_TOKEN (Hugging Face token) with access to the model.
- CPU-friendly since inference happens on HF side; this server just proxies.
"""

import os
import json
import time
from typing import Optional, List, AsyncGenerator

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from huggingface_hub import InferenceClient


app = FastAPI(
    title="GLM-4.6 Inference API",
    description="REST API proxy to HF Inference API for zai-org/GLM-4.6",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def _messages_to_prompt(messages: List[dict]) -> str:
    parts = []
    system_prefix = "System:"
    user_prefix = "User:"
    assistant_prefix = "Assistant:"

    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if not content:
            continue
        if role == "system":
            parts.append(f"{system_prefix} {content}")
        elif role == "assistant":
            parts.append(f"{assistant_prefix} {content}")
        else:
            parts.append(f"{user_prefix} {content}")
    parts.append("Assistant:")
    return "\n".join(parts)


def _estimate_tokens(text: str) -> int:
    # Rough token estimate: 4 chars/token heuristic
    return max(1, int(len(text) / 4))


def _get_hf_client() -> InferenceClient:
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
    repo = os.getenv("HF_MODEL_REPO", "zai-org/GLM-4.6")
    if not token:
        raise HTTPException(status_code=500, detail="HF_TOKEN not set")
    return InferenceClient(model=repo, token=token, timeout=60)


@app.get("/health")
async def health():
    # Only check for token presence; we don't hit HF on every request
    ok = bool(os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN"))
    return {
        "status": "healthy" if ok else "missing_token",
        "model": os.getenv("HF_MODEL_REPO", "zai-org/GLM-4.6"),
        "format": "proxy",
    }


@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {"id": "glm-4.6", "object": "model", "owned_by": "zai-org"}
        ]
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: GenerateRequest):
    try:
        client = _get_hf_client()

        # Build prompt
        if request.messages:
            messages = [{"role": m.role, "content": m.content} for m in request.messages]
        elif request.prompt:
            messages = [{"role": "user", "content": request.prompt}]
        else:
            raise HTTPException(status_code=400, detail="Either messages or prompt required")

        prompt = _messages_to_prompt(messages)

        # Stream or non-stream path
        if request.stream:
            return StreamingResponse(
                _stream_glm(prompt, request.max_tokens, request.temperature, request.top_p),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )
        else:
            start = time.time()
            generated = client.text_generation(
                prompt,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                stream=False,
            )
            elapsed = time.time() - start

            # Usage estimation (approximate)
            prompt_tokens = _estimate_tokens(prompt)
            completion_tokens = _estimate_tokens(generated)
            total_tokens = prompt_tokens + completion_tokens

            return {
                "id": "chatcmpl-glm46",
                "object": "chat.completion",
                "model": "glm-4.6",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": generated},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "elapsed": elapsed,
                },
            }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="HF Inference API timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _stream_glm(
    prompt: str, max_tokens: int, temperature: float, top_p: float
) -> AsyncGenerator[str, None]:
    client = _get_hf_client()
    total_content = ""
    start = time.time()
    try:
        yield f"data: {json.dumps({'choices':[{'delta':{'role':'assistant'}}]})}\n\n"
        for chunk in client.text_generation(
            prompt,
            max_new_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stream=True,
        ):
            # chunk is TextGenerationStreamResponse
            token_text = getattr(chunk, "token", None)
            if token_text and hasattr(token_text, "text"):
                text = token_text.text
                if text:
                    total_content += text
                    payload = {
                        "choices": [
                            {"delta": {"content": text}}
                        ]
                    }
                    yield f"data: {json.dumps(payload)}\n\n"

        # Send usage (estimated)
        prompt_tokens = _estimate_tokens(prompt)
        completion_tokens = _estimate_tokens(total_content)
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


@app.post("/generate")
async def generate(request: GenerateRequest):
    # Non-stream alias
    resp = await chat_completions(request)
    return {
        "text": resp["choices"][0]["message"]["content"],
        "model": "glm-4.6",
        "usage": resp.get("usage", {}),
    }


@app.post("/v1/chat/completions/stream")
async def chat_completions_stream(request: GenerateRequest):
    # Legacy streaming endpoint (mirrors stream=True behavior)
    if request.messages:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
    elif request.prompt:
        messages = [{"role": "user", "content": request.prompt}]
    else:
        raise HTTPException(status_code=400, detail="Either messages or prompt required")
    prompt = _messages_to_prompt(messages)
    return StreamingResponse(
        _stream_glm(prompt, request.max_tokens, request.temperature, request.top_p),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
