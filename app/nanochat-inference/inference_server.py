from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import os
import sys
from typing import List, Optional
import uvicorn

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
model_name = os.environ.get("NANOCHAT_MODEL_NAME", "d32") # Default to d32, can be env var

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
    global model, tokenizer
    print(f"Loading nanochat model: {model_name}...")
    try:
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
                "id": "nanochat-d32-base",
                "object": "model",
                "owned_by": "nanochat"
            }
        ]
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Build messages
        if request.messages:
            messages = [{"role": m.role, "content": m.content} for m in request.messages]
        elif request.prompt:
            messages = [{"role": "user", "content": request.prompt}]
        else:
            raise HTTPException(status_code=400, detail="Either messages or prompt required")

        # Simple prompt aggregation for dummy tokenizer stats
        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])

        # Use existing dummy flow
        dummy_input_ids = tokenizer.encode(prompt_text)
        generated_text = model.generate(
            dummy_input_ids,
            request.max_tokens,
            request.temperature,
            top_k=20  # keep default top_k for dummy
        )

        # Token usage (dummy, but required by client)
        prompt_tokens = len(tokenizer.encode(prompt_text))
        completion_tokens = len(tokenizer.encode(generated_text))
        total_tokens = prompt_tokens + completion_tokens

        return {
            "id": "chatcmpl-nanochat",
            "object": "chat.completion",
            "model": "nanochat-d32-base",
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
