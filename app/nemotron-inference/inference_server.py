"""
Nemotron-3-Nano-30B-A3B Inference Server - Standalone llama-server wrapper

This server manages a llama-server subprocess and proxies requests to it.
We use this approach because the Nemotron-3 nemotron_h_moe architecture
requires llama.cpp master (PR #18058) which has compatibility issues with
llama-cpp-python bindings.
"""

import asyncio
import atexit
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from huggingface_hub import hf_hub_download

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration from environment
MODEL_REPO = os.getenv("MODEL_REPO", "unsloth/Nemotron-3-Nano-30B-A3B-GGUF")
MODEL_FILE = os.getenv("MODEL_FILE", "Nemotron-3-Nano-30B-A3B-Q3_K_M.gguf")
PORT = int(os.getenv("PORT", "8301"))
N_CTX = int(os.getenv("N_CTX", "2048"))
N_THREADS = int(os.getenv("N_THREADS", "4"))
N_BATCH = int(os.getenv("N_BATCH", "1024"))
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", "1"))
HF_TOKEN = os.getenv("HF_TOKEN")

# Internal port for llama-server (proxied through FastAPI)
LLAMA_SERVER_PORT = 8080

app = FastAPI(
    title="Nemotron-3-Nano-30B-A3B Inference API",
    description="REST API for Nemotron-3-Nano-30B-A3B model inference using native llama.cpp",
)

# Global process reference
llama_process: Optional[subprocess.Popen] = None
http_client: Optional[httpx.AsyncClient] = None


def check_llama_server():
    """Check if llama-server binary exists and is executable"""
    llama_path = "/usr/local/bin/llama-server"
    if not os.path.exists(llama_path):
        raise RuntimeError(f"llama-server not found at {llama_path}")

    # Try to get version
    try:
        result = subprocess.run(
            [llama_path, "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        logger.info(f"llama-server version: {result.stdout.strip()}")
    except Exception as e:
        logger.warning(f"Could not get llama-server version: {e}")


def download_model() -> str:
    """Download model from HuggingFace Hub"""
    cache_dir = os.getenv("HF_HOME", "/app/.cache/huggingface")

    logger.info(f"Downloading model: {MODEL_REPO}/{MODEL_FILE}")
    model_path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
        cache_dir=cache_dir,
        token=HF_TOKEN,
    )
    logger.info(f"Model downloaded to: {model_path}")
    return model_path


def start_llama_server(model_path: str) -> subprocess.Popen:
    """Start the llama-server process
    
    Note: The 30B Q4_K_M model requires ~17GB memory for weights.
    We use mmap (default) for efficient memory usage with swap.
    The model will use swap for portions that don't fit in RAM.
    """
    cmd = [
        "/usr/local/bin/llama-server",
        "--model", model_path,
        "--host", "127.0.0.1",
        "--port", str(LLAMA_SERVER_PORT),
        "--ctx-size", str(N_CTX),
        "--threads", str(N_THREADS),
        "--batch-size", str(N_BATCH),
        "--parallel", str(MAX_CONCURRENT),
        # CPU-focused optimizations (flash-attn is GPU-only)
        "--cache-type-k", "q8_0",    # Quantize KV cache for faster access
        "--cache-type-v", "q8_0",    # Quantize value cache too
        "--cont-batching",           # Efficient request batching
        "--log-disable",             # Reduce logging overhead
    ]

    logger.info(f"Starting llama-server: {' '.join(cmd)}")

    # Create log file for llama-server output
    log_file = open("/tmp/llama-server.log", "w", buffering=1)

    process = subprocess.Popen(
        cmd,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    # Wait for server to be ready
    # 30B models can take 3-5 minutes to load into memory on CPU
    max_wait = 300
    start_time = time.time()
    check_count = 0

    while time.time() - start_time < max_wait:
        check_count += 1
        elapsed = int(time.time() - start_time)
        
        try:
            response = httpx.get(f"http://127.0.0.1:{LLAMA_SERVER_PORT}/health", timeout=2)
            if response.status_code == 200:
                logger.info(f"llama-server is ready (took {elapsed}s)")
                return process
            elif response.status_code == 503:
                # 503 means server is running but model still loading
                if check_count % 10 == 0:
                    logger.info(f"llama-server still loading model... ({elapsed}s elapsed)")
        except Exception:
            # Server not responding yet
            if check_count % 10 == 0:
                logger.info(f"Waiting for llama-server to start... ({elapsed}s elapsed)")

        # Check if process died
        if process.poll() is not None:
            log_file.flush()
            try:
                with open("/tmp/llama-server.log", "r") as f:
                    output = f.read()
                logger.error(f"llama-server died during startup. Exit code: {process.returncode}")
                logger.error(f"Output:\n{output}")
            except Exception as e:
                logger.error(f"Could not read log file: {e}")

            raise RuntimeError(f"llama-server failed to start (exit code: {process.returncode})")

        time.sleep(1)

    # Timeout - read logs
    log_file.flush()
    try:
        with open("/tmp/llama-server.log", "r") as f:
            output = f.read()
        logger.error(f"llama-server timeout. Output so far:\n{output}")
    except Exception:
        pass

    raise RuntimeError(f"llama-server did not become healthy in {max_wait}s (model may need more time or resources)")


def cleanup():
    """Cleanup on exit"""
    global llama_process
    if llama_process:
        logger.info("Shutting down llama-server...")
        llama_process.terminate()
        try:
            llama_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            llama_process.kill()


@app.on_event("startup")
async def startup():
    """Initialize the server"""
    global llama_process, http_client

    check_llama_server()
    model_path = download_model()
    llama_process = start_llama_server(model_path)

    http_client = httpx.AsyncClient(
        base_url=f"http://127.0.0.1:{LLAMA_SERVER_PORT}",
        timeout=300.0,
    )

    atexit.register(cleanup)
    signal.signal(signal.SIGTERM, lambda s, f: cleanup())


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    global http_client
    if http_client:
        await http_client.aclose()
    cleanup()


@app.get("/health")
async def health():
    """Health check endpoint"""
    if llama_process is None or llama_process.poll() is not None:
        raise HTTPException(status_code=503, detail="llama-server not running")

    try:
        response = await http_client.get("/health")
        if response.status_code == 200:
            return {"status": "healthy", "model": MODEL_FILE}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

    raise HTTPException(status_code=503, detail="llama-server unhealthy")


@app.get("/health/details")
async def health_details():
    """Detailed health info"""
    return {
        "status": "healthy",
        "model": MODEL_FILE,
        "n_ctx": N_CTX,
        "n_threads": N_THREADS,
        "max_concurrent": MAX_CONCURRENT,
    }


@app.get("/v1/models")
async def list_models():
    """OpenAI-compatible models endpoint"""
    return {
        "object": "list",
        "data": [
            {
                "id": "nemotron-3-nano-30b-a3b",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "nvidia",
            }
        ]
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Proxy chat completions to llama-server"""
    body = await request.json()
    stream = body.get("stream", False)

    if stream:
        async def stream_response():
            async with http_client.stream(
                "POST",
                "/v1/chat/completions",
                json=body,
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

        return StreamingResponse(
            stream_response(),
            media_type="text/event-stream",
        )
    else:
        response = await http_client.post("/v1/chat/completions", json=body)
        return response.json()


@app.post("/v1/completions")
async def completions(request: Request):
    """Proxy completions to llama-server"""
    body = await request.json()
    response = await http_client.post("/v1/completions", json=body)
    return response.json()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
