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


def _chunk_to_text(chunk) -> str:
    """Robustly extract text from HF streaming chunk (str, dict, or dataclass)."""
    # Common case: string
    if isinstance(chunk, str):
        return chunk
    # Dataclass-like with .token.text
    token = getattr(chunk, "token", None)
    if token is not None:
        # token can be a simple str or object with .text
        if isinstance(token, str):
            return token
        text = getattr(token, "text", None)
        if isinstance(text, str):
            return text
    # Dict responses
    if isinstance(chunk, dict):
        t = chunk.get("token")
        if isinstance(t, dict):
            txt = t.get("text")
            if isinstance(txt, str):
                return txt
        # Some providers put text directly
        if isinstance(chunk.get("text"), str):
            return chunk["text"]
        # Finalization payload sometimes contains full text
        if isinstance(chunk.get("generated_text"), str):
            return chunk["generated_text"]
    return ""


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

@app.get("/health/details")
async def health_details():
    token_present = bool(os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN"))
    return {
        "status": "healthy" if token_present else "missing_token",
        "model": os.getenv("HF_MODEL_REPO", "zai-org/GLM-4.6"),
        "format": "proxy",
        "repo": os.getenv("HF_MODEL_REPO", "zai-org/GLM-4.6"),
        "stream_supported": True,
        "git_sha": os.getenv("GIT_SHA", "unknown"),
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
                return_full_text=False,
            )
            elapsed = time.time() - start

            # Normalize output to a string
            if not isinstance(generated, str):
                # Some backends may return list or dict
                if isinstance(generated, list) and generated:
                    cand = generated[0]
                    if isinstance(cand, dict) and isinstance(cand.get("generated_text"), str):
                        generated = cand["generated_text"]
                    else:
                        generated = str(cand)
                elif isinstance(generated, dict) and isinstance(generated.get("generated_text"), str):
                    generated = generated["generated_text"]
                else:
                    generated = str(generated)

            # Usage estimation (approximate)
            prompt_tokens = _estimate_tokens(prompt)
            completion_tokens = _estimate_tokens(generated or "")
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
    final_generated = ""
    start = time.time()
    try:
        yield f"data: {json.dumps({'choices':[{'delta':{'role':'assistant'}}]})}\n\n"
        for chunk in client.text_generation(
            prompt,
            max_new_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stream=True,
            return_full_text=False,
        ):
            text = _chunk_to_text(chunk)
            if text:
                total_content += text
                payload = {"choices": [{"delta": {"content": text}}]}
                yield f"data: {json.dumps(payload)}\n\n"
            # Capture final text if provided only at the end
            gtext = getattr(chunk, "generated_text", None)
            if isinstance(gtext, str) and gtext:
                final_generated = gtext
            elif isinstance(chunk, dict) and isinstance(chunk.get("generated_text"), str):
                final_generated = chunk["generated_text"]

        # If no token deltas were streamed but a final text exists, emit it
        if not total_content and final_generated:
            total_content = final_generated
            payload = {"choices": [{"delta": {"content": final_generated}}]}
            yield f"data: {json.dumps(payload)}\n\n"
        # Fallback: if still empty, try a one-shot non-stream call
        if not total_content:
            try:
                generated = client.text_generation(
                    prompt,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    stream=False,
                    return_full_text=False,
                )
                if not isinstance(generated, str):
                    if isinstance(generated, list) and generated:
                        cand = generated[0]
                        if isinstance(cand, dict) and isinstance(cand.get("generated_text"), str):
                            generated = cand["generated_text"]
                        else:
                            generated = str(cand)
                    elif isinstance(generated, dict) and isinstance(generated.get("generated_text"), str):
                        generated = generated["generated_text"]
                    else:
                        generated = str(generated)
                if generated:
                    total_content = generated
                    payload = {"choices": [{"delta": {"content": generated}}]}
                    yield f"data: {json.dumps(payload)}\n\n"
            except Exception:
                pass

        # Send usage (estimated)
        prompt_tokens = _estimate_tokens(prompt)
        completion_tokens = _estimate_tokens(total_content or "")
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
