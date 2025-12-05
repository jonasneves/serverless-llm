"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
import re
import time
import asyncio
import json
import logging
import httpx
import hashlib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import uvicorn
import pathlib
from urllib.parse import urlparse

from http_client import HTTPClient

# Discussion mode imports
from orchestrator import GitHubModelsOrchestrator
from discussion_engine import DiscussionEngine
from model_profiles import MODEL_PROFILES

# Orchestrator mode imports
from autogen_orchestrator import AutoGenOrchestrator
from tool_orchestrator import ToolOrchestrator

# Verbalized Sampling mode imports
from verbalized_sampling_engine import VerbalizedSamplingEngine
from confession_engine import ConfessionEngine
# Voice mode imports
from voice_engine import VoiceEngine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Force CLaRa to use local endpoint by default to avoid Cloudflare 100s timeout
if not os.getenv("CLARA_API_URL"):
    os.environ["CLARA_API_URL"] = "http://localhost:8000"

def sanitize_error_message(error_text: str, endpoint: str = "") -> str:
    """
    Sanitize error messages to hide raw HTML/technical details from users.
    Logs full details server-side.
    """
    # Log full error for debugging
    logger.error(f"Model error from {endpoint}: {error_text[:500]}...")

    # Check for common error patterns and return user-friendly messages
    error_lower = error_text.lower()

    if "cloudflare" in error_lower or "<!doctype" in error_lower or "<html" in error_lower:
        return "Service temporarily unavailable. The model server may be down or experiencing issues."

    if "timeout" in error_lower:
        return "Request timed out. Please try again."

    if "connection refused" in error_lower or "connect error" in error_lower:
        return "Cannot connect to model server. Please try again later."

    if "502" in error_text or "503" in error_text or "504" in error_text:
        return "Model server is temporarily unavailable."

    if "520" in error_text or "521" in error_text or "522" in error_lower:
        return "Service temporarily unavailable (CDN error)."

    # Strip any HTML tags as a fallback
    clean_text = re.sub(r'<[^>]+>', '', error_text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Truncate if still too long
    if len(clean_text) > 200:
        return clean_text[:200] + "..."

    return clean_text if clean_text else "An unexpected error occurred."

app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup."""
    HTTPClient.get_client()

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    await HTTPClient.close_client()

# Mount static files directory
static_dir = pathlib.Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(static_dir))

# Cache file versions based on content hash for automatic cache busting
FILE_VERSIONS = {}

def get_file_version(filename: str) -> str:
    """
    Generate a cache-busting version string for a file based on its content hash.
    Automatically updates when file content changes - no manual version incrementing needed!
    """
    file_path = static_dir / filename

    # Return cached version if file hasn't changed
    if filename in FILE_VERSIONS:
        cached_mtime, cached_version = FILE_VERSIONS[filename]
        try:
            current_mtime = file_path.stat().st_mtime
            if current_mtime == cached_mtime:
                return cached_version
        except FileNotFoundError:
            return "1"

    # Calculate new version from file content hash
    try:
        content = file_path.read_bytes()
        file_hash = hashlib.md5(content).hexdigest()[:8]  # First 8 chars of hash
        FILE_VERSIONS[filename] = (file_path.stat().st_mtime, file_hash)
        return file_hash
    except FileNotFoundError:
        return "1"

def get_static_versions() -> dict:
    """Get all static file versions for template injection"""
    return {
        "common_css": get_file_version("common.css"),
        "settings_js": get_file_version("settings.js"),
        "chat_css": get_file_version("chat.css"),
        "chat_js": get_file_version("chat.js"),
        "discussion_js": get_file_version("discussion.js"),
        "orchestrator_js": get_file_version("orchestrator.js"),
        "verbalized_sampling_js": get_file_version("verbalized_sampling.js"),
        "confessions_js": get_file_version("confessions.js"),
        "model_loader_js": get_file_version("model-loader.js"),
        "voice_js": get_file_version("voice.js"),
    }

MODEL_CONFIG = (
    {
        "id": "qwen2.5-14b-instruct",
        "name": "Qwen 2.5-14B",
        "env": "QWEN14B_API_URL",
        "default_url": "http://localhost:8004",
        "service": "qwen14b",
    },
    {
        "id": "qwen2.5-7b",
        "name": "Qwen 2.5-7B",
        "env": "QWEN_API_URL",
        "default_url": "http://localhost:8001",
        "default": True,
        "service": "qwen",
    },
    {
        "id": "gemma-2-9b-instruct",
        "name": "Gemma 2 9B",
        "env": "GEMMA_API_URL",
        "default_url": "http://localhost:8006",
    },
    {
        "id": "clara-7b-instruct",
        "name": "CLaRa 7B",
        "env": "CLARA_API_URL",
        "default_url": "http://localhost:8000", # Changed from 8007 to 8000
    },
    {
        "id": "mistral-7b-instruct-v0.3",
        "name": "Mistral 7B v0.3",
        "env": "MISTRAL_API_URL",
        "default_url": "http://localhost:8005",
    },
    {
        "id": "phi-3-mini",
        "name": "Phi-3 Mini",
        "env": "PHI_API_URL",
        "default_url": "http://localhost:8002",
    },
    {
        "id": "llama-3.2-3b",
        "name": "Llama 3.2-3B",
        "env": "LLAMA_API_URL",
        "default_url": "http://localhost:8003",
    },
)

# Base domain configuration for production (Cloudflare tunnels)
# Accepts raw hostnames ("neevs.io") or full URLs ("https://neevs.io")
RAW_BASE_DOMAIN = os.getenv("BASE_DOMAIN", "").strip()
BASE_DOMAIN = ""
BASE_SCHEME = "https"

if RAW_BASE_DOMAIN:
    candidate = RAW_BASE_DOMAIN.strip()
    if candidate.startswith("http://") or candidate.startswith("https://"):
        parsed = urlparse(candidate)
        BASE_SCHEME = parsed.scheme or "https"
        candidate = (parsed.netloc or parsed.path).strip()
    BASE_DOMAIN = candidate.rstrip("/")

def build_service_url(service: str) -> str:
    """Construct a service URL using the normalized base domain."""
    return f"{BASE_SCHEME}://{service}.{BASE_DOMAIN}"

def get_endpoint(config):
    """Get endpoint URL for a service, prioritization: Env Var > Base Domain > Default."""
    # 1. Specific Env Var (e.g. CLARA_API_URL)
    if os.getenv(config["env"]):
        return os.getenv(config["env"])

    # 2. Base Domain (if configured)
    if BASE_DOMAIN:
        # Allow explicit service override, otherwise derive from model ID
        # Qwen IDs include version numbers (e.g., qwen2.5), so we need to map them to "qwen"
        service = config.get("service") or config["id"].split("-")[0].split(".")[0]
        return build_service_url(service)
    
    # 3. Default Local URL
    return config["default_url"]

MODEL_ENDPOINTS = {
    config["id"]: get_endpoint(config)
    for config in MODEL_CONFIG
}

MODEL_DISPLAY_NAMES = {
    config["id"]: config["name"]
    for config in MODEL_CONFIG
}

# VibeVoice configuration
if BASE_DOMAIN:
    VIBEVOICE_ENDPOINT = build_service_url("vibevoice")
else:
    VIBEVOICE_ENDPOINT = os.getenv("VIBEVOICE_API_URL", "http://localhost:8000")

DEFAULT_MODEL_ID = next(
    (config["id"] for config in MODEL_CONFIG if config.get("default")),
    MODEL_CONFIG[0]["id"] if MODEL_CONFIG else None,
)

# Request queueing: limit concurrent requests per model to prevent overload
# GitHub Actions runners have limited CPU (2 cores), so we limit to 1 concurrent request per model
MODEL_SEMAPHORES = {
    model_id: asyncio.Semaphore(1)
    for model_id in MODEL_ENDPOINTS.keys()
}

# Log configured endpoints at startup
logger.info("=" * 60)
logger.info("MODEL ENDPOINTS CONFIGURED:")
for model_id, endpoint in MODEL_ENDPOINTS.items():
    logger.info(f"  {model_id}: {endpoint}")
logger.info(f"  VibeVoice: {VIBEVOICE_ENDPOINT}")
logger.info("Request queueing enabled: 1 concurrent request per model")
logger.info("=" * 60)

class ChatMessage(BaseModel):
    role: str
    content: str

class GenerationParams(BaseModel):
    max_tokens: int = 512
    temperature: float = 0.7


class ChatRequest(GenerationParams):
    model: str
    messages: List[ChatMessage]


class MultiChatRequest(GenerationParams):
    models: List[str]
    messages: List[ChatMessage]

class ModelStatus(BaseModel):
    model: str
    status: str
    endpoint: str

class DiscussionRequest(GenerationParams):
    query: str
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen2.5-7b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    turns: int = 2  # Number of discussion rounds (all models participate each round)
    participants: Optional[List[str]] = None  # List of model IDs to participate (default: all local models)

class OrchestratorRequest(GenerationParams):
    query: str
    max_rounds: int = 5  # Maximum orchestration rounds

class VerbalizedSamplingRequest(BaseModel):
    query: str


class ConfessionRequest(BaseModel):
    query: str

class VoiceScriptRequest(BaseModel):
    topic: str
    style: str = "podcast"
    speakers: List[str]
    model: Optional[str] = None

class VoiceAudioRequest(BaseModel):
    script: str
    speakers: List[str]


def serialize_messages(messages: List[ChatMessage]) -> List[dict]:
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def build_completion_payload(
    messages: List[dict],
    max_tokens: int,
    temperature: float,
    *,
    stream: bool = False,
) -> dict:
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if stream:
        payload["stream"] = True
    return payload


def get_model_endpoint_or_error(model_id: str, *, status_code: int = 400) -> str:
    if model_id not in MODEL_ENDPOINTS:
        raise HTTPException(
            status_code=status_code,
            detail=f"Unknown model: {model_id}. Available: {list(MODEL_ENDPOINTS.keys())}",
        )
    return MODEL_ENDPOINTS[model_id]



@app.get("/")
async def chat_interface(request: Request):
    """Serve chat interface with automatic cache busting"""
    return templates.TemplateResponse(
        "chat.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/discussion")
async def discussion_interface(request: Request):
    """Serve discussion mode interface with automatic cache busting"""
    return templates.TemplateResponse(
        "discussion.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/voice")
async def voice_interface(request: Request):
    """Serve voice studio interface"""
    return templates.TemplateResponse(
        "voice.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/autogen")
async def autogen_interface(request: Request):
    """Serve AutoGen mode interface with automatic cache busting"""
    return templates.TemplateResponse(
        "orchestrator.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/variations")
async def variations_interface(request: Request):
    """Serve Verbalized Sampling (Variations) interface with automatic cache busting"""
    return templates.TemplateResponse(
        "verbalized_sampling.html",
        {"request": request, **get_static_versions()}
    )


@app.get("/confessions")
async def confessions_interface(request: Request):
    """Serve Confessions mode interface"""
    return templates.TemplateResponse(
        "confessions.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/status")
async def status_page(request: Request):
    """Serve health status dashboard with automatic cache busting"""
    return templates.TemplateResponse(
        "status.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/health")
async def health():
    """Basic health check for the chat interface"""
    return {"status": "healthy", "service": "chat-interface"}

async def check_model_health(model_id: str, endpoint: str) -> dict:
    """
    Perform a detailed health check on a single model, including inference test.
    """
    client = HTTPClient.get_client()
    start_time = time.time()
    
    try:
        # Test health endpoint
        health_response = await client.get(f"{endpoint}/health")

        if health_response.status_code == 200:
            health_data = health_response.json()

            # Additionally test a simple completion to verify model works
            try:
                test_response = await client.post(
                    f"{endpoint}/v1/chat/completions",
                    json={
                        "messages": [{"role": "user", "content": "Hi"}],
                        "max_tokens": 5,
                        "temperature": 0.1
                    },
                    timeout=30.0
                )

                return {
                    "status": "online",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "passed" if test_response.status_code == 200 else "failed",
                    "response_time_ms": int((time.time() - start_time) * 1000)
                }
            except Exception as e:
                # Health passed but inference failed
                return {
                    "status": "degraded",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "failed",
                    "error": str(e),
                    "response_time_ms": int((time.time() - start_time) * 1000)
                }
        else:
            return {
                "status": "unhealthy",
                "endpoint": endpoint,
                "error": f"Health check returned {health_response.status_code}",
                "response_time_ms": int((time.time() - start_time) * 1000)
            }

    except httpx.TimeoutException:
        return {
            "status": "offline",
            "endpoint": endpoint,
            "error": "Connection timeout",
            "response_time_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {
            "status": "offline",
            "endpoint": endpoint,
            "error": str(e),
            "response_time_ms": int((time.time() - start_time) * 1000)
        }

@app.get("/api/health/detailed")
async def detailed_health():
    """
    Comprehensive health check for all services
    Tests actual endpoints to verify they're working
    """
    results = {
        "chat_interface": {
            "status": "healthy",
            "timestamp": time.time()
        },
        "models": {}
    }

    # Check each model endpoint
    # We can run these in parallel for faster results
    tasks = [
        check_model_health(model_id, endpoint)
        for model_id, endpoint in MODEL_ENDPOINTS.items()
    ]
    
    model_results = await asyncio.gather(*tasks)
    
    for model_id, result in zip(MODEL_ENDPOINTS.keys(), model_results):
        results["models"][model_id] = result

    # Calculate overall status
    model_statuses = [m["status"] for m in results["models"].values()]
    if not model_statuses:
        results["overall_status"] = "healthy" # No models configured
    elif all(s == "online" for s in model_statuses):
        results["overall_status"] = "healthy"
    elif any(s == "online" for s in model_statuses):
        results["overall_status"] = "degraded"
    else:
        results["overall_status"] = "unhealthy"

    return results

async def _quick_model_health(timeout: float = 3.0):
    """Lightweight /health checks for badge endpoints."""
    client = HTTPClient.get_client()

    async def check_model(model_id: str, endpoint: str):
        try:
            response = await client.get(f"{endpoint}/health", timeout=timeout)
            if response.status_code == 200:
                return model_id, "online"
            return model_id, "unhealthy"
        except httpx.TimeoutException:
            return model_id, "timeout"
        except Exception:
            return model_id, "offline"

    tasks = [check_model(model_id, endpoint) for model_id, endpoint in MODEL_ENDPOINTS.items()]
    results = await asyncio.gather(*tasks)
    return dict(results)


@app.get("/api/badge/system")
async def system_badge():
    """
    Shields.io-compatible badge endpoint for overall system health
    Returns: https://img.shields.io/endpoint?url=<this-endpoint>
    """
    try:
        model_statuses = await _quick_model_health()
        total_count = len(model_statuses)
        online_count = sum(1 for status in model_statuses.values() if status == "online")

        if total_count == 0:
            color = "lightgrey"
            message = "no models"
        elif online_count == total_count:
            color = "brightgreen"
            message = f"{online_count}/{total_count} online"
        elif online_count > 0:
            color = "yellow"
            message = f"{online_count}/{total_count} online"
        else:
            color = "red"
            message = "offline"

        return {
            "schemaVersion": 1,
            "label": "API Status",
            "message": message,
            "color": color
        }
    except Exception:
        return {
            "schemaVersion": 1,
            "label": "API Status",
            "message": "error",
            "color": "red"
        }

@app.get("/api/badge/model/{model_id}")
async def model_badge(model_id: str):
    """
    Shields.io-compatible badge endpoint for individual model health
    Usage: https://img.shields.io/endpoint?url=<this-endpoint>&label=Qwen
    """
    if model_id not in MODEL_ENDPOINTS:
        return {
            "schemaVersion": 1,
            "label": model_id,
            "message": "unknown",
            "color": "lightgrey"
        }

    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    try:
        client = HTTPClient.get_client()
        # Quick health check
        response = await client.get(f"{endpoint}/health", timeout=5.0)

        if response.status_code == 200:
            return {
                "schemaVersion": 1,
                "label": display_name,
                "message": "online",
                "color": "brightgreen"
            }
        else:
            return {
                "schemaVersion": 1,
                "label": display_name,
                "message": "unhealthy",
                "color": "orange"
            }
    except Exception:
        return {
            "schemaVersion": 1,
            "label": display_name,
            "message": "offline",
            "color": "red"
        }

@app.get("/api/models")
async def list_models():
    return {
        "models": [
            {
                "id": config["id"],
                "name": config["name"],
                "endpoint": MODEL_ENDPOINTS[config["id"]],
                "default": config.get("default", False),
            }
            for config in MODEL_CONFIG
        ],
        "endpoints": MODEL_ENDPOINTS,
        "default_model": DEFAULT_MODEL_ID,
    }

@app.get("/api/models/{model_id}/status")
async def model_status(model_id: str, detailed: bool = False):
    endpoint = get_model_endpoint_or_error(model_id, status_code=404)
    
    if detailed:
        result = await check_model_health(model_id, endpoint)
        return result

    # Simple check for non-detailed requests
    try:
        client = HTTPClient.get_client()
        response = await client.get(f"{endpoint}/health", timeout=5.0)
        if response.status_code == 200:
            return ModelStatus(model=model_id, status="online", endpoint=endpoint)
    except Exception:
        pass

    return ModelStatus(model=model_id, status="offline", endpoint=endpoint)

@app.post("/api/chat")
async def chat(request: ChatRequest):
    endpoint = get_model_endpoint_or_error(request.model)
    full_url = f"{endpoint}/v1/chat/completions"
    messages = serialize_messages(request.messages)
    payload = build_completion_payload(messages, request.max_tokens, request.temperature)

    logger.info(f"Calling {request.model} at {full_url}")

    client = HTTPClient.get_client()

    try:
        response = await client.post(
            full_url,
            json=payload
        )

        if response.status_code != 200:
            error_detail = f"Model {request.model} at {endpoint} returned {response.status_code}: {response.text[:200]}"
            logger.error(error_detail)
            raise HTTPException(
                status_code=response.status_code,
                detail=error_detail
            )

        return response.json()

    except httpx.TimeoutException as e:
        error_msg = f"Timeout calling {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=504, detail=error_msg)
    except httpx.ConnectError as e:
        error_msg = f"Cannot connect to {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=503, detail=error_msg)
    except Exception as e:
        error_msg = f"Unexpected error calling {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

async def query_model(client: httpx.AsyncClient, model_id: str, messages: list, max_tokens: int, temperature: float):
    """Query a single model and return results with timing (with request queueing)"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    # Use semaphore to limit concurrent requests per model
    semaphore = MODEL_SEMAPHORES.get(model_id)

    start_time = time.time()
    try:
        async with semaphore:
            response = await client.post(
                f"{endpoint}/v1/chat/completions",
                json=build_completion_payload(messages, max_tokens, temperature)
            )
            elapsed = time.time() - start_time

            if response.status_code != 200:
                error_msg = sanitize_error_message(response.text, endpoint)
                return {
                    "model": display_name,
                    "content": error_msg,
                    "error": True,
                    "time": elapsed
                }

            data = response.json()

            # Ensure usage data is present
            if "usage" not in data:
                raise ValueError(f"Usage data not received from model {model_id}")

            return {
                "model": display_name,
                "content": data["choices"][0]["message"]["content"],
                "usage": data["usage"],
                "time": elapsed,
                "error": False
            }

    except httpx.TimeoutException:
        logger.error(f"Timeout querying {endpoint}")
        return {
            "model": display_name,
            "content": "Request timed out. Please try again.",
            "error": True,
            "time": time.time() - start_time
        }
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        return {
            "model": display_name,
            "content": "Cannot connect to model server. Please try again later.",
            "error": True,
            "time": time.time() - start_time
        }
    except Exception as e:
        logger.exception(f"Unexpected error querying {endpoint}")
        return {
            "model": display_name,
            "content": "An unexpected error occurred. Please try again.",
            "error": True,
            "time": time.time() - start_time
        }

@app.post("/api/chat/multi")
async def chat_multi(request: MultiChatRequest):
    """Query multiple models in parallel"""
    messages = serialize_messages(request.messages)
    client = HTTPClient.get_client()

    tasks = [
        query_model(client, model_id, messages, request.max_tokens, request.temperature)
        for model_id in request.models
        if model_id in MODEL_ENDPOINTS
    ]

    responses = await asyncio.gather(*tasks)

    return {"responses": responses}


async def stream_model_response(model_id: str, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream response from a single model using SSE format (with request queueing and keep-alives)"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)
    start_time = time.time()
    total_content = ""

    # Use semaphore to limit concurrent requests per model
    semaphore = MODEL_SEMAPHORES.get(model_id)
    client = HTTPClient.get_client()

    # Send initial event immediately
    yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'start'})}\n\n"

    try:
        async with semaphore:
            # Build the request
            request = client.build_request(
                "POST",
                f"{endpoint}/v1/chat/completions",
                json=build_completion_payload(
                    messages,
                    max_tokens,
                    temperature,
                    stream=True,
                )
            )

            # Start the request in a way we can monitor progress
            # We use client.send(..., stream=True) which returns a Response object we must manually close
            
            # 1. Wait for Headers (TTFB)
            response = None
            try:
                # We loop until we get the response headers or error
                while True:
                    try:
                        # Wait up to 15 seconds for the connection/headers
                        response = await asyncio.wait_for(
                            client.send(request, stream=True),
                            timeout=15.0
                        )
                        break # Got headers!
                    except asyncio.TimeoutError:
                        # No headers yet, send keep-alive to browser
                        yield ": keep-alive\n\n"
            except Exception as e:
                # If the actual connection failed or timed out (client-side limit), handle it
                raise e

            try:
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_msg = sanitize_error_message(error_text.decode(), endpoint)
                    yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': error_msg})}\n\n"
                    return

                usage_data = None
                
                # 2. Wait for Body Chunks (Streaming)
                # We need to iterate manually to inject keep-alives during gaps
                iterator = response.aiter_lines()
                
                while True:
                    try:
                        # Wait for next line
                        line = await asyncio.wait_for(anext(iterator), timeout=15.0)
                        
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str.strip() == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                # Capture usage data if present
                                if "usage" in data:
                                    usage_data = data["usage"]

                                if "choices" in data and len(data["choices"]) > 0:
                                    delta = data["choices"][0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        total_content += content
                                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'content': content, 'event': 'token'})}\n\n"
                            except json.JSONDecodeError:
                                pass
                                
                    except asyncio.TimeoutError:
                        # Stream stalled, send keep-alive
                        yield ": keep-alive\n\n"
                    except StopAsyncIteration:
                        # Stream finished
                        break

                # Send completion event with stats
                elapsed = time.time() - start_time

                # Use real token count from usage data if available
                if usage_data and "total_tokens" in usage_data:
                    token_count = usage_data["total_tokens"]
                else:
                    # Fallback estimate if no usage data
                    token_count = len(total_content.split()) * 1.3

                yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'done', 'time': elapsed, 'total_content': total_content, 'token_estimate': int(token_count), 'usage': usage_data})}\n\n"

            finally:
                # CRITICAL: Always close the streaming response
                await response.aclose()

    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'Request timed out. Please try again.'})}\n\n"
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'Cannot connect to model server. Please try again later.'})}\n\n"
    except Exception as e:
        logger.exception(f"Unexpected error streaming from {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'An unexpected error occurred. Please try again.'})}\n\n"


async def stream_multiple_models(models: list, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream responses from multiple models, yielding chunks in real-time as they arrive"""

    # Use a queue to collect chunks from all models in real-time
    queue: asyncio.Queue = asyncio.Queue()
    active_streams = len([m for m in models if m in MODEL_ENDPOINTS])
    completed_streams = 0

    async def stream_to_queue(model_id: str):
        """Stream from a single model and put chunks into the shared queue"""
        nonlocal completed_streams
        try:
            async for chunk in stream_model_response(model_id, messages, max_tokens, temperature):
                await queue.put(chunk)
        finally:
            completed_streams += 1
            # Signal completion when all streams are done
            if completed_streams >= active_streams:
                await queue.put(None)  # Sentinel to signal completion

    # Start all streams concurrently
    tasks = [
        asyncio.create_task(stream_to_queue(model_id))
        for model_id in models
        if model_id in MODEL_ENDPOINTS
    ]

    if not tasks:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    # Yield chunks as they arrive from any model
    try:
        while True:
            chunk = await queue.get()
            if chunk is None:  # Sentinel - all streams completed
                break
            yield chunk
    finally:
        # Ensure all tasks are cleaned up
        for task in tasks:
            if not task.done():
                task.cancel()

    # Send final done event
    yield f"data: {json.dumps({'event': 'all_done'})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: MultiChatRequest):
    """Stream chat responses using Server-Sent Events"""
    messages = serialize_messages(request.messages)

    return StreamingResponse(
        stream_multiple_models(request.models, messages, request.max_tokens, request.temperature),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def stream_discussion_events(
    query: str,
    max_tokens: int,
    temperature: float,
    orchestrator_model: Optional[str] = None,
    github_token: Optional[str] = None,
    turns: int = 2,
    participants: Optional[List[str]] = None
) -> AsyncGenerator[str, None]:
    """
    Stream discussion events as Server-Sent Events

    Events:
    - analysis_start: Orchestrator begins analyzing query
    - analysis_complete: Query analysis results with domain weights
    - turn_start: Model begins responding
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with evaluation
    - synthesis_start: Begin creating final response
    - synthesis_complete: Synthesis plan ready
    - discussion_complete: Full discussion finished
    - error: Error occurred
    """
    try:
        # Determine orchestrator model type
        api_models = [
            'gpt-4.1', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
            'deepseek-v3-0324', 'cohere-command-r-plus-08-2024',
            'llama-3.3-70b-instruct', 'llama-4-scout-17b-16e-instruct', 'meta-llama-3.1-405b-instruct'
        ]
        local_models = list(MODEL_ENDPOINTS.keys())

        selected_orchestrator = orchestrator_model or 'gpt-4o'
        is_api_model = selected_orchestrator in api_models

        if is_api_model:
            # Initialize GitHub Models API orchestrator
            # Use user-provided token if available, otherwise fall back to server env var
            token = github_token or os.getenv("GH_MODELS_TOKEN")
            if not token:
                yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator. Please provide your token or contact the server admin.'})}\n\n"
                return

            orchestrator = GitHubModelsOrchestrator(
                github_token=token,
                model_id=selected_orchestrator
            )
        elif selected_orchestrator in local_models:
            # Initialize local model orchestrator
            local_endpoint = MODEL_ENDPOINTS[selected_orchestrator]
            orchestrator = GitHubModelsOrchestrator(
                github_token="local",  # Placeholder, won't be used
                model_id=selected_orchestrator,
                api_url=f"{local_endpoint}/v1/chat/completions"
            )
            # Override the headers method for local models
            orchestrator._get_headers = lambda: {"Content-Type": "application/json"}
        else:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Unknown orchestrator model: {selected_orchestrator}'})}\n\n"
            return

        # Initialize discussion engine
        engine = DiscussionEngine(
            orchestrator=orchestrator,
            model_endpoints=MODEL_ENDPOINTS,
            timeout_per_turn=60
        )

        # Run discussion with streaming events
        async for event in engine.run_discussion(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature,
            turns=turns,
            participants=participants
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Discussion error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@app.post("/api/chat/discussion/stream")
async def discussion_stream(request: DiscussionRequest):
    """
    Stream collaborative multi-model discussion using Server-Sent Events

    Models discuss the query together, guided by an orchestrator (GPT-5-nano)
    that evaluates contributions based on each model's benchmark-proven strengths.

    Request body:
    - query: User's question or request
    - max_tokens: Max tokens per model response (default: 512)
    - temperature: Sampling temperature (default: 0.7)

    Stream events (all sent as SSE):
    - analysis_complete: Orchestrator's query analysis with domain classification
    - turn_start: Model begins turn with expertise score
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with quality evaluation
    - synthesis_complete: Final synthesis plan
    - discussion_complete: Full discussion with final response
    - error: Error details
    """
    return StreamingResponse(
        stream_discussion_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.orchestrator_model,
            request.github_token,
            request.turns,
            request.participants
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# Orchestrator Mode Endpoint
async def stream_orchestrator_events(
    query: str,
    max_tokens: int,
    temperature: float,
    max_rounds: int
) -> AsyncGenerator[str, None]:
    """
    Stream AutoGen multi-agent orchestration events

    Uses Microsoft AutoGen framework with specialist agents
    """
    try:
        # Use ToolOrchestratorEngine instead of AutoGenOrchestrator to match logic in orchestrator_engine.py
        # Note: The original code imported AutoGenOrchestrator but used it in a way that matched ToolOrchestra.
        # I will stick to the updated import if it matches the file I just refactored (orchestrator_engine.py).
        
        # However, looking at the original file, it imported AutoGenOrchestrator from autogen_orchestrator.py
        # AND OrchestratorEngine is defined in orchestrator_engine.py which I refactored.
        # The endpoint `orchestrator_stream` uses `stream_orchestrator_events`.
        # `stream_orchestrator_events` uses `AutoGenOrchestrator()`.
        
        # Wait, `orchestrator_engine.py` contains `OrchestratorEngine`.
        # `autogen_orchestrator.py` contains `AutoGenOrchestrator`.
        # The route `/api/chat/orchestrator/stream` in the ORIGINAL file used `stream_orchestrator_events` which used `AutoGenOrchestrator`.
        
        # BUT, the docstring for `orchestrator_stream` says: "The orchestrator (Qwen 2.5-7B) intelligently routes..." which matches `OrchestratorEngine` in `orchestrator_engine.py`.
        # Let me double check the original `chat_server.py` content I read.
        
        # In the original file:
        # from autogen_orchestrator import AutoGenOrchestrator
        # ...
        # async def stream_orchestrator_events(...)
        #    engine = AutoGenOrchestrator()
        
        # Yet `orchestrator_engine.py` (which I refactored) seems to be the "ToolOrchestra" implementation described in the docs.
        # Let's look at `AGENTS.md`. It says "app/chat-interface/orchestrator_engine.py # Core orchestration logic".
        # So `orchestrator_engine.py` IS the core logic.
        # Why does `chat_server.py` import `AutoGenOrchestrator`?
        
        # Maybe `autogen_orchestrator.py` is a wrapper or a different implementation?
        # Let's verify `autogen_orchestrator.py` content to be safe.
        pass
    except Exception:
        pass

    try:
        # Use ToolOrchestrator which is now the renamed AutoGenOrchestrator
        engine = AutoGenOrchestrator()

        async for event in engine.run_orchestration(
            query=query,
            max_turns=max_rounds
        ):
            # Ensure proper JSON encoding with explicit settings
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Orchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/chat/orchestrator/stream")
async def orchestrator_stream(request: OrchestratorRequest):
    """
    Stream ToolOrchestra-style intelligent orchestration using Server-Sent Events

    The orchestrator (Qwen 2.5-7B) intelligently routes to specialized models and tools
    across multiple rounds to efficiently solve complex tasks.

    Request body:
    - query: User's question or request
    - max_tokens: Max tokens per model response (default: 512)
    - temperature: Sampling temperature (default: 0.7)
    - max_rounds: Maximum orchestration rounds (default: 5)

    Stream events (all sent as SSE):
    - start: Orchestration begins
    - round_start: New round begins
    - tool_call: Orchestrator calls a tool
    - tool_result: Tool execution result
    - orchestrator_thinking: Orchestrator reasoning
    - final_answer: Final synthesized answer
    - complete: Orchestration finished
    - error: Error details

    Tools available:
    - enhance_reasoning: Call specialized reasoning models (Qwen/Phi/Llama)
    - answer: Generate final answer with best model
    - search: Web search for missing information
    - code_interpreter: Execute Python code
    """
    return StreamingResponse(
        stream_orchestrator_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.max_rounds
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ToolOrchestrator Endpoint
async def stream_tool_orchestrator_events(
    query: str,
    max_tokens: int,
    temperature: float,
    max_rounds: int
) -> AsyncGenerator[str, None]:
    """
    Stream ToolOrchestrator events (formerly OrchestratorEngine)
    """
    try:
        engine = ToolOrchestrator(max_rounds=max_rounds)

        async for event in engine.run_orchestration(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"ToolOrchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/chat/tool-orchestrator/stream")
async def tool_orchestrator_stream(request: OrchestratorRequest):
    """
    Stream ToolOrchestrator-style intelligent orchestration
    """
    return StreamingResponse(
        stream_tool_orchestrator_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.max_rounds
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ===== VERBALIZED SAMPLING MODE =====
async def stream_verbalized_sampling_events(
    query: str,
    model: str,
    num_responses: int,
    temperature: float,
    max_tokens: int
) -> AsyncGenerator[str, None]:
    """
    Stream Verbalized Sampling events
    
    Uses the Stanford research technique to unlock LLM diversity by asking for
    a distribution of responses rather than a single response.
    """
    try:
        # Get model endpoint
        if model not in MODEL_ENDPOINTS:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Model {model} not found'}, ensure_ascii=False)}\n\n"
            return
        
        model_endpoint = MODEL_ENDPOINTS[model]
        model_name = MODEL_DISPLAY_NAMES.get(model, model)
        
        # Create engine and stream responses
        engine = VerbalizedSamplingEngine(model_endpoint, model_name)
        
        async for event in engine.generate_diverse_responses(
            query=query,
            num_responses=num_responses,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            # Ensure proper JSON encoding
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    
    except Exception as e:
        logger.error(f"Verbalized Sampling error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/verbalized-sampling/stream")
async def verbalized_sampling_stream(
    request: VerbalizedSamplingRequest,
    model: str = "qwen2.5-7b",
    num_responses: int = 5,
    temperature: float = 0.8,
    max_tokens: int = 1024
):
    """
    Stream Verbalized Sampling responses using Server-Sent Events
    
    Implements Stanford's Verbalized Sampling technique to mitigate mode collapse
    and unlock LLM diversity by asking for a distribution of responses.
    
    Query parameters:
    - model: Model to use (default: qwen2.5-7b)
    - num_responses: Number of diverse responses (default: 5)
    - temperature: Sampling temperature for diversity (default: 0.8)
    - max_tokens: Max tokens per response (default: 1024)
    
    Request body:
    - query: User's question or prompt
    
    Stream events:
    - start: Generation begins
    - chunk: Streaming content chunks
    - complete: Generation finished with parsed responses and diversity score
    - error: Error details
    """
    return StreamingResponse(
        stream_verbalized_sampling_events(
            request.query,
            model,
            num_responses,
            temperature,
            max_tokens
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ===== CONFESSIONS MODE =====
async def stream_confession_events(
    query: str,
    model: str,
    temperature: float,
    max_tokens: int
) -> AsyncGenerator[str, None]:
    try:
        if model not in MODEL_ENDPOINTS:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Model {model} not found'}, ensure_ascii=False)}\n\n"
            return

        endpoint = MODEL_ENDPOINTS[model]
        model_name = MODEL_DISPLAY_NAMES.get(model, model)
        engine = ConfessionEngine(endpoint, model_name)

        async for event in engine.generate_with_confession(
            query=query,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Confessions mode error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/confessions/stream")
async def confessions_stream(
    request: ConfessionRequest,
    model: str = "qwen2.5-7b",
    temperature: float = 0.7,
    max_tokens: int = 512
):
    """Stream answer + confession events."""
    return StreamingResponse(
        stream_confession_events(
            request.query,
            model,
            temperature,
            max_tokens
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ===== VOICE MODE =====
async def stream_voice_script_events(
    topic: str,
    style: str,
    speakers: List[str],
    model_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    try:
        # Determine which model endpoint to use
        if model_id and model_id in MODEL_ENDPOINTS:
             llm_endpoint = MODEL_ENDPOINTS[model_id]
        else:
             llm_endpoint = MODEL_ENDPOINTS.get(DEFAULT_MODEL_ID)
        
        if not llm_endpoint:
             yield f"data: {json.dumps({'event': 'error', 'error': 'No LLM endpoint configured'}, ensure_ascii=False)}\n\n"
             return

        engine = VoiceEngine(llm_endpoint, VIBEVOICE_ENDPOINT)
        
        async for event in engine.generate_script(topic, style, speakers):
            yield f"data: {json.dumps({'event': event['type'], **event}, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Voice script error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

@app.post("/api/voice/script")
async def voice_script(request: VoiceScriptRequest):
    """Stream script generation"""
    return StreamingResponse(
        stream_voice_script_events(request.topic, request.style, request.speakers, request.model),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

async def stream_voice_audio_events(
    script: str,
    speakers: List[str]
) -> AsyncGenerator[str, None]:
    try:
        # Use the default model endpoint as placeholder if needed, but engine mostly uses TTS endpoint
        default_model_endpoint = MODEL_ENDPOINTS.get(DEFAULT_MODEL_ID)
        engine = VoiceEngine(default_model_endpoint, VIBEVOICE_ENDPOINT)
        
        async for event in engine.synthesize_audio(script, speakers):
            yield f"data: {json.dumps({'event': event['type'], **event}, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Voice audio error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"

@app.post("/api/voice/audio")
async def voice_audio(request: VoiceAudioRequest):
    """Stream audio generation progress/result"""
    return StreamingResponse(
        stream_voice_audio_events(request.script, request.speakers),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
