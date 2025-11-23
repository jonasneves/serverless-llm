"""
Llama 3.2-8B Inference Server
FastAPI-based REST API for LLM inference
"""

import os
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

app = FastAPI(
    title="Llama 3.2-8B Inference API",
    description="REST API for Meta Llama 3.2-8B model inference",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model and tokenizer
model = None
tokenizer = None

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

class GenerateResponse(BaseModel):
    text: str
    model: str
    usage: dict

@app.on_event("startup")
async def load_model():
    global model, tokenizer

    model_name = os.getenv("MODEL_NAME", "meta-llama/Llama-3.2-8B-Instruct")
    use_4bit = os.getenv("USE_4BIT", "true").lower() == "true"

    print(f"Loading model: {model_name}")

    tokenizer = AutoTokenizer.from_pretrained(
        model_name,
        trust_remote_code=True
    )

    if use_4bit and torch.cuda.is_available():
        quantization_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4"
        )
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True
        )
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=dtype,
            device_map="auto" if torch.cuda.is_available() else None,
            trust_remote_code=True
        )
        if device == "cpu":
            model = model.to(device)

    print(f"Model loaded successfully on {next(model.parameters()).device}")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": "Llama-3.2-8B-Instruct",
        "gpu_available": torch.cuda.is_available()
    }

@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {
                "id": "llama-3.2-8b-instruct",
                "object": "model",
                "owned_by": "meta"
            }
        ]
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: GenerateRequest):
    global model, tokenizer

    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Build conversation from messages
        if request.messages:
            text = tokenizer.apply_chat_template(
                [{"role": m.role, "content": m.content} for m in request.messages],
                tokenize=False,
                add_generation_prompt=True
            )
        elif request.prompt:
            text = request.prompt
        else:
            raise HTTPException(status_code=400, detail="Either messages or prompt required")

        inputs = tokenizer(text, return_tensors="pt").to(model.device)
        input_length = inputs.input_ids.shape[1]

        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                do_sample=request.temperature > 0,
                pad_token_id=tokenizer.eos_token_id
            )

        generated_text = tokenizer.decode(
            outputs[0][input_length:],
            skip_special_tokens=True
        )

        return {
            "id": "chatcmpl-llama",
            "object": "chat.completion",
            "model": "llama-3.2-8b-instruct",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": generated_text
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": input_length,
                "completion_tokens": outputs.shape[1] - input_length,
                "total_tokens": outputs.shape[1]
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate")
async def generate(request: GenerateRequest):
    """Simple generation endpoint"""
    response = await chat_completions(request)
    return GenerateResponse(
        text=response["choices"][0]["message"]["content"],
        model="llama-3.2-8b-instruct",
        usage=response["usage"]
    )

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
