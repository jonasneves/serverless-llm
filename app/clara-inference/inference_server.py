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

    # CLaRa uses subfolders within the repo for different compression levels
    # We need to download the repo and load from the subfolder
    from huggingface_hub import snapshot_download

    base_repo = "apple/CLaRa-7B-Instruct"

    print(f"Downloading CLaRa model from: {base_repo}")
    print(f"Using compression level: {compression}x")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    # Download the entire repo
    cache_dir = os.getenv("HF_HOME", None)
    # Speed up large downloads on Actions: allow only needed files and enable hf_transfer if available
    allow_patterns = [f"compression-{compression}/*", "tokenizer.*", "tokenizer_config.json", "config.json", "*.py"]
    repo_path = snapshot_download(
        repo_id=base_repo,
        cache_dir=cache_dir,
        token=os.getenv("HF_TOKEN"),
        allow_patterns=allow_patterns
    )

    # Load from the compression subfolder
    model_path = os.path.join(repo_path, f"compression-{compression}")

    print(f"Loading model from: {model_path}")

    # Patch the config.json file directly to fix hardcoded paths
    config_file = os.path.join(model_path, "config.json")

    with open(config_file, 'r') as f:
        config_dict = json.load(f)

    # Replace hardcoded local paths with HF model IDs
    patched = False
    if 'compr_base_model_name' in config_dict and '/mnt/ceph_rbd' in config_dict['compr_base_model_name']:
        print(f"Patching compr_base_model_name: {config_dict['compr_base_model_name']} -> mistralai/Mistral-7B-Instruct-v0.2")
        config_dict['compr_base_model_name'] = "mistralai/Mistral-7B-Instruct-v0.2"
        patched = True

    if 'decoder_model_name' in config_dict and '/mnt/ceph_rbd' in config_dict['decoder_model_name']:
        print(f"Patching decoder_model_name: {config_dict['decoder_model_name']} -> mistralai/Mistral-7B-Instruct-v0.2")
        config_dict['decoder_model_name'] = "mistralai/Mistral-7B-Instruct-v0.2"
        patched = True

    # Write patched config back to disk
    if patched:
        with open(config_file, 'w') as f:
            json.dump(config_dict, f, indent=2)
        print("Config file patched successfully")

    # Patch modeling_clara.py to fix PEFT issue and CPU compatibility
    modeling_file = os.path.join(model_path, "modeling_clara.py")
    if os.path.exists(modeling_file):
        print(f"Patching {modeling_file} for PEFT and CPU compatibility")
        with open(modeling_file, 'r') as f:
            content = f.read()
        
        modified = False

        # 1. PEFT compatibility: Replace target_modules='all-linear'
        old_target = "target_modules='all-linear'"
        new_target = "target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj']"
        
        if old_target in content:
            print(f"  - Replacing 'all-linear' with specific modules")
            content = content.replace(old_target, new_target)
            modified = True
        
        # 2. CPU compatibility: Remove hardcoded CUDA device calls
        if ".to('cuda')" in content:
            print(f"  - Replacing .to('cuda') with .to(self.decoder.device)")
            content = content.replace(".to('cuda')", ".to(self.decoder.device)")
            modified = True

        if '.to("cuda")' in content:
            print(f"  - Replacing .to(\"cuda\") with .to(self.decoder.device)")
            content = content.replace('.to("cuda")', ".to(self.decoder.device)")
            modified = True

        # 3. CPU compatibility: Remove CUDA allocation config
        cuda_conf = 'os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"'
        if cuda_conf in content:
            print(f"  - Commenting out PYTORCH_CUDA_ALLOC_CONF")
            content = content.replace(cuda_conf, f'# {cuda_conf}')
            modified = True

        # 4. CPU compatibility: Fix mse_loss BFloat16 issue
        mse_call = "F.mse_loss(non_mem_mean, mem_mean, reduction='mean')"
        mse_fix = "F.mse_loss(non_mem_mean.float(), mem_mean.float(), reduction='mean')"
        if mse_call in content:
            print(f"  - Patching mse_loss for BFloat16 CPU compatibility")
            content = content.replace(mse_call, mse_fix)
            modified = True

        if modified:
            with open(modeling_file, 'w') as f:
                f.write(content)
            print("modeling_clara.py patched successfully")
        else:
            print("No patches needed for modeling_clara.py")

    # Try loading with minimal interference - let CLaRa's custom code handle everything
    print(f"Loading CLaRa model (this may take several minutes)...")
    print("Note: CLaRa requires significant RAM for LoRA adapters + base model")

    # Tune PyTorch threading for 2-vCPU GitHub runners (adjust via env if needed)
    try:
        torch.set_num_threads(int(os.getenv("TORCH_NUM_THREADS", "2")))
        torch.set_num_interop_threads(int(os.getenv("TORCH_NUM_INTEROP_THREADS", "1")))
    except Exception as _:
        pass

    try:
        # Prefer safetensors if available; keep options minimal for remote code
        clara_model = AutoModel.from_pretrained(
            model_path,
            trust_remote_code=True,
            use_safetensors=True
        ).to(device)
    except ValueError as e:
        if "Dropout" in str(e) and "not supported" in str(e):
            print(f"\n{'='*60}")
            print("ERROR: CLaRa has a PEFT compatibility issue")
            print("The model tries to apply LoRA to Dropout modules,")
            print("which PEFT doesn't support. This is a bug in CLaRa's code.")
            print(f"{'='*60}\n")
        raise

    print("CLaRa model loaded successfully!")

    # Optional: dynamic INT8 quantization for CPU (reduces memory and may speed up)
    if os.getenv("CLARA_INT8", "0") == "1":
        try:
            from torch.ao.quantization import quantize_dynamic
            print("Applying dynamic INT8 quantization to Linear layers...")
            clara_model = quantize_dynamic(clara_model, {torch.nn.Linear}, dtype=torch.qint8)
            print("Dynamic quantization applied.")
        except Exception as e:
            print(f"Quantization warning: {e}")

    # Warm up
    print("Warming up model...")
    try:
        with torch.inference_mode():
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
            # Use CLaRa's native document-based generation under inference mode
            def _gen(questions, documents, max_new_tokens):
                with torch.inference_mode():
                    return clara_model.generate_from_text(
                        questions=questions,
                        documents=documents,
                        max_new_tokens=max_new_tokens
                    )
            answers = await asyncio.to_thread(
                _gen, request.questions, request.documents, request.max_tokens
            )

        return RAGResponse(
            answers=answers,
            model="clara-7b-instruct",
            compression=f"{compression}x"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def stream_chat_response(question: str, documents: List[List[str]], max_tokens: int):
    """
    Stream chat response in SSE format with simulated token-by-token output

    Since CLaRa doesn't support native streaming, we generate the full response
    then chunk it to simulate streaming and avoid Cloudflare timeouts.
    """
    try:
        async with inference_lock:
            # Generate using CLaRa under inference mode
            def _gen1(questions, documents, max_new_tokens):
                with torch.inference_mode():
                    return clara_model.generate_from_text(
                        questions=questions,
                        documents=documents,
                        max_new_tokens=max_new_tokens
                    )
            answers = await asyncio.to_thread(
                _gen1, [question], documents, max_tokens
            )

        answer = answers[0] if answers else "No response generated."

        # Estimate token counts
        prompt_tokens = len(question.split()) * 1.3
        completion_tokens = len(answer.split()) * 1.3

        # Chunk the response to simulate streaming (helps with Cloudflare timeouts)
        # Split by words for smoother streaming experience
        words = answer.split()
        chunk_size = max(1, len(words) // 20)  # ~20 chunks

        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i+chunk_size])
            if i + chunk_size < len(words):
                chunk += ' '  # Add space between chunks except last one

            chunk_data = {
                "id": "chatcmpl-clara",
                "object": "chat.completion.chunk",
                "model": "clara-7b-instruct",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": chunk},
                        "finish_reason": None
                    }
                ]
            }
            yield f"data: {json.dumps(chunk_data)}\n\n"

            # Small delay to simulate real streaming and keep connection alive
            await asyncio.sleep(0.05)

        # Send final chunk with usage data
        final_chunk = {
            "id": "chatcmpl-clara",
            "object": "chat.completion.chunk",
            "model": "clara-7b-instruct",
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": int(prompt_tokens),
                "completion_tokens": int(completion_tokens),
                "total_tokens": int(prompt_tokens + completion_tokens)
            }
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as e:
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "server_error"
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"


@app.post("/v1/chat/completions")
async def chat_completions(request: GenerateRequest):
    """
    Standard chat completions endpoint

    Supports both streaming and non-streaming modes.
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

        # Handle streaming requests
        if request.stream:
            return StreamingResponse(
                stream_chat_response(question, documents, request.max_tokens),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )

        # Non-streaming response
        async with inference_lock:
            # Generate using CLaRa under inference mode
            def _gen2(questions, documents, max_new_tokens):
                with torch.inference_mode():
                    return clara_model.generate_from_text(
                        questions=questions,
                        documents=documents,
                        max_new_tokens=max_new_tokens
                    )
            answers = await asyncio.to_thread(
                _gen2, [question], documents, request.max_tokens
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
