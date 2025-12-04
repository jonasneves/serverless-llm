"""
CLaRa-7B-Instruct Inference Server
FastAPI-based REST API for CLaRa unified RAG model with semantic compression

CLaRa supports two modes:
1. Standard chat completions (for orchestrator compatibility)
2. RAG mode with document compression (16x and 128x)
"""

import os
import json
import asyncio
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from transformers import AutoModel

app = FastAPI(
    title="CLaRa-7B Inference API",
    description="REST API for CLaRa-7B unified RAG model with semantic compression",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model
clara_model = None
inference_lock = asyncio.Semaphore(1)
MODEL_NAME = "CLaRa-7B-Instruct"
COMPRESSION_LEVEL = os.getenv("COMPRESSION_LEVEL", "16")  # 16 or 128

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

class RAGRequest(BaseModel):
    """RAG-specific request with documents"""
    questions: List[str]
    documents: List[List[str]]  # List of document lists (one per question)
    max_tokens: int = 64
    compression: Optional[str] = None  # "16" or "128", defaults to env

class GenerateResponse(BaseModel):
    text: str
    model: str
    usage: dict

class RAGResponse(BaseModel):
    answers: List[str]
    model: str
    compression: str

def load_model():
    """Load CLaRa model from Hugging Face"""
    global clara_model

    compression = COMPRESSION_LEVEL
    model_path = f"apple/CLaRa-7B-Instruct/compression-{compression}"

    print(f"Loading CLaRa model: {model_path}")
    print(f"Using compression level: {compression}x")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    clara_model = AutoModel.from_pretrained(
        model_path,
        trust_remote_code=True
    ).to(device)

    print("CLaRa model loaded successfully!")

    # Warm up
    print("Warming up model...")
    try:
        clara_model.generate_from_text(
            questions=["Test question?"],
            documents=[["This is a test document."]],
            max_new_tokens=1
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
        "status": "healthy" if clara_model is not None else "loading",
        "model": MODEL_NAME,
        "compression": f"{COMPRESSION_LEVEL}x",
        "capabilities": ["chat", "rag", "document_compression"]
    }

@app.get("/v1/models")
async def list_models():
    return {
        "data": [
            {
                "id": "clara-7b-instruct",
                "object": "model",
                "owned_by": "apple"
            }
        ]
    }

@app.post("/v1/rag/generate")
async def rag_generate(request: RAGRequest):
    """
    RAG generation with document compression

    This endpoint uses CLaRa's native document compression capabilities.
    """
    global clara_model

    if clara_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        compression = request.compression or COMPRESSION_LEVEL

        async with inference_lock:
            # Use CLaRa's native document-based generation
            answers = await asyncio.to_thread(
                clara_model.generate_from_text,
                questions=request.questions,
                documents=request.documents,
                max_new_tokens=request.max_tokens
            )

        return RAGResponse(
            answers=answers,
            model="clara-7b-instruct",
            compression=f"{compression}x"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
async def chat_completions(request: GenerateRequest):
    """
    Standard chat completions endpoint

    For orchestrator compatibility. Note: This doesn't use CLaRa's compression
    features - use /v1/rag/generate for document-based Q&A.
    """
    global clara_model

    if clara_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # Build prompt from messages
        if request.messages:
            # Extract the last user message as the question
            user_messages = [m for m in request.messages if m.role == "user"]
            if not user_messages:
                raise HTTPException(status_code=400, detail="No user message found")
            question = user_messages[-1].content

            # Use conversation history as "documents" for context
            context_docs = []
            for msg in request.messages[:-1]:  # Exclude last message
                context_docs.append(f"{msg.role}: {msg.content}")

            documents = [context_docs] if context_docs else [["No prior context."]]
        elif request.prompt:
            question = request.prompt
            documents = [["No context provided."]]
        else:
            raise HTTPException(status_code=400, detail="Either messages or prompt required")

        async with inference_lock:
            # Generate using CLaRa
            answers = await asyncio.to_thread(
                clara_model.generate_from_text,
                questions=[question],
                documents=documents,
                max_new_tokens=request.max_tokens
            )

        answer = answers[0] if answers else "No response generated."

        # Estimate token counts (rough approximation)
        prompt_tokens = len(question.split()) * 1.3  # rough tokenization
        completion_tokens = len(answer.split()) * 1.3

        return {
            "id": "chatcmpl-clara",
            "object": "chat.completion",
            "model": "clara-7b-instruct",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": answer
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": int(prompt_tokens),
                "completion_tokens": int(completion_tokens),
                "total_tokens": int(prompt_tokens + completion_tokens)
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
        model="clara-7b-instruct",
        usage=response["usage"]
    )

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
