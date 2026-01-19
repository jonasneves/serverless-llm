"""
Shared llama-server Subprocess Wrapper

Base infrastructure for models that require native llama-server instead of
llama-cpp-python bindings (due to architecture incompatibilities).

Used by: LFM2, RNJ, Nemotron
"""

import asyncio
import atexit
import logging
import os
import signal
import subprocess
import time
from dataclasses import dataclass
from typing import Optional, List

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from huggingface_hub import hf_hub_download

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LLAMA_SERVER_PORT = 8080


@dataclass
class LlamaServerConfig:
    """Configuration for llama-server wrapper"""
    model_id: str
    display_name: str
    owned_by: str
    default_repo: str
    default_file: str
    default_port: int
    n_ctx: int = 4096
    n_threads: int = 4
    n_batch: int = 256
    max_concurrent: int = 2
    startup_timeout: int = 300
    extra_args: Optional[List[str]] = None


def create_llama_server_app(config: LlamaServerConfig) -> FastAPI:
    """
    Create a FastAPI app that wraps llama-server subprocess.

    This factory function creates an inference server that:
    1. Downloads the model from HuggingFace
    2. Starts llama-server as a subprocess
    3. Proxies requests to the subprocess

    Args:
        config: LlamaServerConfig with model settings

    Returns:
        FastAPI application ready to run
    """
    MODEL_REPO = os.getenv("MODEL_REPO", config.default_repo)
    MODEL_FILE = os.getenv("MODEL_FILE", config.default_file)
    PORT = int(os.getenv("PORT", str(config.default_port)))
    N_CTX = int(os.getenv("N_CTX", str(config.n_ctx)))
    N_THREADS = int(os.getenv("N_THREADS", str(config.n_threads)))
    N_BATCH = int(os.getenv("N_BATCH", str(config.n_batch)))
    MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", str(config.max_concurrent)))
    HF_TOKEN = os.getenv("HF_TOKEN")
    STARTUP_TIMEOUT = int(os.getenv("STARTUP_TIMEOUT", str(config.startup_timeout)))

    app = FastAPI(
        title=f"{config.display_name} Inference API",
        description=f"REST API for {config.display_name} model inference using native llama.cpp",
    )

    # Global state
    llama_process: Optional[subprocess.Popen] = None
    http_client: Optional[httpx.AsyncClient] = None
    log_file = None

    def check_llama_server():
        """Check if llama-server binary exists and is executable"""
        llama_path = "/usr/local/bin/llama-server"
        if not os.path.exists(llama_path):
            raise RuntimeError(f"llama-server not found at {llama_path}")

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
        """Start the llama-server process"""
        nonlocal log_file

        cmd = [
            "/usr/local/bin/llama-server",
            "--model", model_path,
            "--host", "127.0.0.1",
            "--port", str(LLAMA_SERVER_PORT),
            "--ctx-size", str(N_CTX),
            "--threads", str(N_THREADS),
            "--batch-size", str(N_BATCH),
            "--parallel", str(MAX_CONCURRENT),
            "--cont-batching",
            "--flash-attn", "auto",
        ]

        if config.extra_args:
            cmd.extend(config.extra_args)

        logger.info(f"Starting llama-server: {' '.join(cmd)}")

        log_file = open("/tmp/llama-server.log", "w", buffering=1)

        process = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        # Wait for server to be ready
        start_time = time.time()
        check_count = 0

        while time.time() - start_time < STARTUP_TIMEOUT:
            check_count += 1
            elapsed = int(time.time() - start_time)

            try:
                response = httpx.get(f"http://127.0.0.1:{LLAMA_SERVER_PORT}/health", timeout=2)
                if response.status_code == 200:
                    logger.info(f"llama-server is ready (took {elapsed}s)")
                    return process
                elif response.status_code == 503:
                    if check_count % 10 == 0:
                        logger.info(f"llama-server still loading model... ({elapsed}s elapsed)")
            except Exception:
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

        log_file.flush()
        try:
            with open("/tmp/llama-server.log", "r") as f:
                output = f.read()
            logger.error(f"llama-server timeout. Output so far:\n{output}")
        except Exception:
            pass

        raise RuntimeError(f"llama-server did not become healthy in {STARTUP_TIMEOUT}s")

    def cleanup():
        """Cleanup on exit"""
        nonlocal llama_process
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
        nonlocal llama_process, http_client

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
        nonlocal http_client
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
                return {"status": "healthy", "model": config.display_name, "format": "GGUF"}
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))

        raise HTTPException(status_code=503, detail="llama-server unhealthy")

    @app.get("/health/details")
    async def health_details():
        """Detailed health info"""
        return {
            "status": "healthy",
            "model": config.display_name,
            "format": "GGUF",
            "repo": MODEL_REPO,
            "file": MODEL_FILE,
            "n_ctx": N_CTX,
            "n_threads": N_THREADS,
            "n_batch": N_BATCH,
            "max_concurrent": MAX_CONCURRENT,
            "cpu_count": os.cpu_count(),
            "openblas_num_threads": os.getenv("OPENBLAS_NUM_THREADS"),
            "omp_num_threads": os.getenv("OMP_NUM_THREADS"),
            "instance_id": os.getenv("INSTANCE_ID", "1"),
            "git_sha": os.getenv("GITHUB_SHA", os.getenv("GIT_SHA", "unknown")),
        }

    @app.get("/v1/models")
    async def list_models():
        """OpenAI-compatible models endpoint"""
        return {
            "object": "list",
            "data": [
                {
                    "id": config.model_id,
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": config.owned_by,
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

    return app
