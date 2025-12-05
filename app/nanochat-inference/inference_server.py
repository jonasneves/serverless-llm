from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import os
import sys
from typing import List, Optional
import uvicorn
import json
import asyncio
import threading

try:
    from huggingface_hub import hf_hub_download
except Exception:
    hf_hub_download = None  # Optional

try:
    from llama_cpp import Llama  # type: ignore
except Exception:
    Llama = None  # Optional

try:
    from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer  # type: ignore
except Exception:
    AutoTokenizer = None  # type: ignore
    AutoModelForCausalLM = None  # type: ignore
    TextIteratorStreamer = None  # type: ignore

# Placeholder for nanochat core logic.
# In a real scenario, you would clone the nanochat repository
# and ensure its modules are importable, e.g., by adding its path to sys.path
# or copying relevant files.
# For example:
# NANOCHAT_PATH = os.environ.get("NANOCHAT_PATH", "/app/nanochat") # Assuming nanochat is cloned here
# sys.path.insert(0, NANOCHAT_PATH)
# from nanochat.model import GPT  # This is an educated guess

app = FastAPI(
    title="nanochat Inference API",
    description="REST API for nanochat model inference",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model loading placeholder
# This will be replaced with actual nanochat model loading logic
# based on how nanochat handles checkpoints, tokenizers, and model architecture.
model = None
tokenizer = None
llm = None  # llama.cpp model if using GGUF
inference_lock = asyncio.Semaphore(1)
model_name = os.environ.get("NANOCHAT_MODEL_NAME", "d34")  # Default to d34
hf_model_id = os.environ.get("NANOCHAT_HF_MODEL", "karpathy/nanochat-d34")

class InferenceRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 100
    temperature: float = 0.8
    top_k: int = 20

class InferenceResponse(BaseModel):
    generated_text: str


# OpenAI-compatible request/response models
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    stream: bool = False

@app.on_event("startup")
async def load_model():
    global model, tokenizer, llm
    print(f"Loading nanochat model: {model_name}...")
    try:
        # 1) Prefer GGUF via llama.cpp if configured (HF like others)
        gguf_repo = os.getenv("NANOCHAT_GGUF_REPO")
        gguf_file = os.getenv("NANOCHAT_GGUF_FILE")
        if gguf_repo and gguf_file and hf_hub_download and Llama:
            print(f"Downloading GGUF from {gguf_repo}/{gguf_file}")
            model_path = hf_hub_download(
                repo_id=gguf_repo,
                filename=gguf_file,
                cache_dir=os.getenv("HF_HOME", "/tmp/hf_cache")
            )
            n_ctx = int(os.getenv("NANOCHAT_N_CTX", "2048"))
            n_threads = int(os.getenv("NANOCHAT_N_THREADS", "2"))

            print(f"Loading GGUF with n_ctx={n_ctx}, n_threads={n_threads}")
            llm = Llama(
                model_path=model_path,
                n_ctx=n_ctx,
                n_threads=n_threads,
                use_mlock=True,
                use_mmap=True,
                n_batch=512,
                last_n_tokens_size=64,
                verbose=True
            )
            # Warm-up
            try:
                llm.create_chat_completion(
                    messages=[{"role": "user", "content": "Hi"}],
                    max_tokens=1,
                    temperature=0.1
                )
            except Exception as e:
                print(f"Warm-up warning: {e}")
            print("nanochat GGUF loaded via llama.cpp")
            return

        # Try to locate a local clone of karpathy/nanochat if available
        nc_path_env = os.environ.get("NANOCHAT_PATH", "")
        repo_guess = os.path.join(os.path.dirname(__file__), "nanochat_repo")
        candidate_paths = [p for p in [nc_path_env, repo_guess] if p]
        loaded_real = False

        for p in candidate_paths:
            if os.path.isdir(p) and p not in sys.path:
                sys.path.insert(0, p)
        
        # Attempt speculative imports (structure may change upstream)
        try:
            # Common patterns: model.py with GPT, tokenizer.py with Tokenizer
            nc_model = None
            nc_tokenizer = None
            try:
                from model import GPT as NC_GPT  # type: ignore
                nc_model = NC_GPT  # noqa
            except Exception:
                pass
            try:
                from tokenizer import Tokenizer as NC_Tokenizer  # type: ignore
                nc_tokenizer = NC_Tokenizer  # noqa
            except Exception:
                pass

            if nc_model and nc_tokenizer:
                # If upstream exposes config helpers
                cfg = None
                try:
                    from config import get_config as nc_get_config  # type: ignore
                    cfg = nc_get_config(model_name)
                except Exception:
                    cfg = None

                if cfg is not None:
                    model_obj = nc_model(cfg)
                else:
                    model_obj = nc_model  # May be a prebuilt object (unlikely)

                # Load checkpoint if provided
                ckpt_dir = os.environ.get("NANOCHAT_CHECKPOINTS_DIR", "")
                ckpt_file = os.environ.get("NANOCHAT_CHECKPOINT_FILE", "")
                if ckpt_dir and ckpt_file:
                    ckpt_path = os.path.join(os.path.expanduser(ckpt_dir), ckpt_file)
                elif ckpt_dir:
                    ckpt_path = os.path.join(os.path.expanduser(ckpt_dir), "model_latest.pt")
                else:
                    ckpt_path = ""

                if ckpt_path and os.path.exists(ckpt_path):
                    sd = torch.load(ckpt_path, map_location="cpu")
                    try:
                        model_obj.load_state_dict(sd)
                    except Exception:
                        # Some repos save dict under 'model'
                        if isinstance(sd, dict) and 'model' in sd:
                            model_obj.load_state_dict(sd['model'])
                    model_obj.eval()

                # Tokenizer path
                tok_dir = os.environ.get("NANOCHAT_TOKENIZER_DIR", "")
                tok_file = os.environ.get("NANOCHAT_TOKENIZER_FILE", "")
                if tok_dir and tok_file:
                    tok_path = os.path.join(os.path.expanduser(tok_dir), tok_file)
                elif tok_dir:
                    tok_path = os.path.join(os.path.expanduser(tok_dir), "tokenizer.model")
                else:
                    tok_path = ""

                if tok_dir or tok_file:
                    tokenizer_obj = nc_tokenizer(tok_path)
                else:
                    # Some repos allow constructing without path
                    try:
                        tokenizer_obj = nc_tokenizer()
                    except Exception:
                        tokenizer_obj = None

                if model_obj is not None and tokenizer_obj is not None:
                    model = model_obj
                    tokenizer = tokenizer_obj
                    loaded_real = True
                    print("Loaded real nanochat model via local repo imports.")
        except Exception as e:
            print(f"Nanochat real import attempt failed: {e}")

        if not loaded_real and AutoTokenizer is not None and AutoModelForCausalLM is not None:
            # 2) Try Transformers from Hugging Face (karpathy/nanochat-d34 by default)
            print(f"Loading Transformers model from HF: {hf_model_id}")
            tok = AutoTokenizer.from_pretrained(hf_model_id)
            mdl = AutoModelForCausalLM.from_pretrained(hf_model_id)
            mdl.eval()
            model = mdl
            tokenizer = tok
            loaded_real = True
            print("Loaded nanochat via Transformers (HF)")

        if not loaded_real:
            # Fallback to dummy model
            class DummyModel:
                def generate(self, input_ids, max_new_tokens, temperature, top_k):
                    return "This is a dummy generated response from nanochat."

            class DummyTokenizer:
                def encode(self, text):
                    return [1, 2, 3]
                def decode(self, tokens):
                    return ""

            model = DummyModel()
            tokenizer = DummyTokenizer()
            print(f"Nanochat model {model_name} loaded in dummy mode. Set NANOCHAT_PATH and checkpoints to enable real model.")
    except Exception as e:
        raise RuntimeError(f"Failed to load nanochat model {model_name}: {e}")

@app.post("/generate", response_model=InferenceResponse)
async def generate_text(request: InferenceRequest):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")

    try:
        # --- NANOCHAT SPECIFIC INFERENCE LOGIC GOES HERE ---
        # This part requires using the nanochat model's generation method.
        # Example (highly speculative):
        # input_ids = tokenizer.encode(request.prompt)
        # input_ids = torch.tensor(input_ids).unsqueeze(0) # Batch dimension
        # output_ids = model.generate(
        #     input_ids,
        #     max_new_tokens=request.max_new_tokens,
        #     temperature=request.temperature,
        #     top_k=request.top_k
        # )
        # generated_text = tokenizer.decode(output_ids.squeeze().tolist())

        # Using dummy model for now
        dummy_input_ids = tokenizer.encode(request.prompt)
        generated_text = model.generate(
            dummy_input_ids,
            request.max_new_tokens,
            request.temperature,
            request.top_k
        )

        return InferenceResponse(generated_text=generated_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")

@app.get("/health")
async def health_check():
    return {"status": "ok", "model_loaded": model is not None}


@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {
                "id": "nanochat-d34-base",
                "object": "model",
                "owned_by": "nanochat"
            }
        ]
    }


async def _generate_with_llama(messages: list, max_tokens: int, temperature: float, top_p: float, stream: bool):
    global llm
    if llm is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if stream:
        async def streamer():
            try:
                async with inference_lock:
                    response = await asyncio.to_thread(
                        llm.create_chat_completion,
                        messages=messages,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        top_p=top_p,
                        stream=True
                    )
                    generated_text = ""
                    for chunk in response:
                        if "choices" in chunk and chunk["choices"]:
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta:
                                content = delta["content"]
                                generated_text += content
                                yield f"data: {json.dumps(chunk)}\n\n"
                                await asyncio.sleep(0)

                    # Usage chunk
                    prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
                    prompt_tokens = len(llm.tokenize(prompt_text.encode()))
                    completion_tokens = len(llm.tokenize(generated_text.encode()))
                    usage_chunk = {
                        "choices": [{"delta": {}, "finish_reason": "stop"}],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    }
                    yield f"data: {json.dumps(usage_chunk)}\n\n"
                    yield "data: [DONE]\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return streamer()
    else:
        async with inference_lock:
            response = await asyncio.to_thread(
                llm.create_chat_completion,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
            )
        return response


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    # Build messages
    if request.messages:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
    elif request.prompt:
        messages = [{"role": "user", "content": request.prompt}]
    else:
        raise HTTPException(status_code=400, detail="Either messages or prompt required")

    # llama.cpp path (GGUF via HF)
    if llm is not None:
        if request.stream:
            from fastapi.responses import StreamingResponse
            return StreamingResponse(
                _generate_with_llama(messages, request.max_tokens, request.temperature, request.top_p, True),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        else:
            data = await _generate_with_llama(messages, request.max_tokens, request.temperature, request.top_p, False)
            return {
                "id": "chatcmpl-nanochat",
                "object": "chat.completion",
                "model": "nanochat-d34-base",
                "choices": data["choices"],
                "usage": data["usage"]
            }

    # Transformers path (HF)
    if model is not None and tokenizer is not None and hasattr(model, "generate") and AutoTokenizer is not None:
        # Prepare input
        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        if request.stream and TextIteratorStreamer is not None:
            from fastapi.responses import StreamingResponse

            async def stream_hf():
                nonlocal prompt_text
                streamer = TextIteratorStreamer(tokenizer, skip_special_tokens=True, timeout=60.0)
                inputs = tokenizer(prompt_text, return_tensors="pt")

                gen_kwargs = dict(
                    **inputs,
                    streamer=streamer,
                    max_new_tokens=request.max_tokens,
                    do_sample=True,
                    temperature=request.temperature,
                    top_p=request.top_p,
                )

                # Run generation in a thread
                thread = threading.Thread(target=model.generate, kwargs=gen_kwargs)
                thread.start()

                generated_text = ""
                try:
                    for piece in streamer:
                        if piece:
                            generated_text += piece
                            chunk = {"choices": [{"delta": {"content": piece}}]}
                            yield f"data: {json.dumps(chunk)}\n\n"
                            await asyncio.sleep(0)
                finally:
                    thread.join(timeout=0)

                # Usage estimation
                prompt_tokens = len(tokenizer.encode(prompt_text))
                completion_tokens = len(tokenizer.encode(generated_text))
                usage_chunk = {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": prompt_tokens + completion_tokens
                    }
                }
                yield f"data: {json.dumps(usage_chunk)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                stream_hf(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        else:
            # Non-streaming
            inputs = tokenizer(prompt_text, return_tensors="pt")
            output_ids = model.generate(
                **inputs,
                max_new_tokens=request.max_tokens,
                do_sample=True,
                temperature=request.temperature,
                top_p=request.top_p,
            )
            generated_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)

            prompt_tokens = len(tokenizer.encode(prompt_text))
            completion_tokens = len(tokenizer.encode(generated_text))
            return {
                "id": "chatcmpl-nanochat",
                "object": "chat.completion",
                "model": "nanochat-d34-base",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": generated_text},
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens
                }
            }

    # Fallback: python dummy model/tokenizer
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        input_ids = tokenizer.encode(prompt_text)
        generated_text = model.generate(
            input_ids,
            request.max_tokens,
            request.temperature,
            top_k=20
        )

        prompt_tokens = len(tokenizer.encode(prompt_text))
        completion_tokens = len(tokenizer.encode(generated_text))
        total_tokens = prompt_tokens + completion_tokens

        if request.stream:
            from fastapi.responses import StreamingResponse
            async def dummy_stream():
                first_chunk = {
                    "choices": [{"delta": {"content": generated_text}}]
                }
                yield f"data: {json.dumps(first_chunk)}\n\n"
                usage_chunk = {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                }
                yield f"data: {json.dumps(usage_chunk)}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(
                dummy_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )

            return {
                "id": "chatcmpl-nanochat",
                "object": "chat.completion",
                "model": "nanochat-d34-base",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": generated_text},
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens
                }
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
