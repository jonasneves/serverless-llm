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
        # --- NANOCHAT SPECIFIC MODEL LOADING LOGIC GOES HERE ---
        # This part requires understanding the nanochat repository's structure
        # and how to instantiate their model and tokenizer.
        # Example (highly speculative):
        # from nanochat.config import get_config
        # from nanochat.model import GPT
        # from nanochat.tokenizer import Tokenizer

        # config = get_config(model_name)
        # model = GPT(config)
        # checkpoint_path = os.path.join(
        #     os.environ.get("NANOCHAT_CHECKPOINTS_DIR", f"~/.cache/nanochat/chatsft_checkpoints/{model_name}"),
        #     "model_latest.pt" # Or specific checkpoint file
        # )
        # model.load_state_dict(torch.load(checkpoint_path, map_location='cpu')) # Adjust map_location as needed
        # model.eval()

        # tokenizer_path = os.path.join(
        #     os.environ.get("NANOCHAT_TOKENIZER_DIR", "~/.cache/nanochat/tokenizer"),
        #     "tokenizer.pkl"
        # )
        # tokenizer = Tokenizer(tokenizer_path) # Speculative

        # For demonstration, we'll use a dummy model
        class DummyModel:
            def generate(self, input_ids, max_new_tokens, temperature, top_k):
                # Simulate text generation
                print(f"Dummy model generating for input: {input_ids}")
                dummy_output = "This is a dummy generated response from nanochat."
                return dummy_output

        class DummyTokenizer:
            def encode(self, text):
                print(f"Dummy tokenizer encoding: {text}")
                return [1, 5, 2, 8] # Dummy token IDs
            def decode(self, tokens):
                print(f"Dummy tokenizer decoding: {tokens}")
                return "dummy decoded text" # Dummy decoded text

        model = DummyModel()
        tokenizer = DummyTokenizer()

        print(f"Nanochat model {model_name} loaded successfully (dummy implementation).")
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
