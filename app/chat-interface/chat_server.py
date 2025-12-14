"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
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
from typing import Dict, List, Optional, AsyncGenerator
import uvicorn
import pathlib
from urllib.parse import urlparse

from http_client import HTTPClient
from constants import DEFAULT_LOCAL_ENDPOINTS

# Discussion mode imports
from orchestrator import GitHubModelsOrchestrator
from discussion_engine import DiscussionEngine
from model_profiles import MODEL_PROFILES

# Orchestrator mode imports
try:
    from autogen_orchestrator import AutoGenOrchestrator
except ImportError:
    print("AutoGen not available. Orchestrator mode disabled.")
    AutoGenOrchestrator = None

from tool_orchestrator import ToolOrchestrator

# Verbalized Sampling mode imports
from verbalized_sampling_engine import VerbalizedSamplingEngine
from confession_engine import ConfessionEngine
from error_utils import sanitize_error_message
from rate_limiter import get_rate_limiter


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache of GitHub Models that returned "unknown_model".
# Prevents repeated network calls/log spam for invalid IDs.
UNSUPPORTED_GITHUB_MODELS: set[str] = set()

def get_default_github_token() -> Optional[str]:
    """Return default GitHub Models token from environment."""
    return (
        os.getenv("GH_MODELS_TOKEN")
        or os.getenv("GITHUB_TOKEN")
        or os.getenv("GH_TOKEN")
    )

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

def validate_environment():
    """
    Validate required environment variables on startup.
    Logs warnings for missing optional components and errors for critical issues.
    """
    errors = []
    warnings = []
    
    # Check if at least one model endpoint is configured
    configured_models = [
        model_id for model_id, endpoint in MODEL_ENDPOINTS.items()
        if endpoint and endpoint != DEFAULT_LOCAL_ENDPOINTS.get(f"{model_id.upper().replace('-', '_').replace('.', '_')}_API_URL", "")
    ]
    
    if not configured_models:
        warnings.append("No model endpoints explicitly configured - using defaults (localhost)")
    
    # Check GitHub token for Discussion/Agents modes
    gh_token = get_default_github_token()
    if not gh_token:
        warnings.append("GH_MODELS_TOKEN not set - Discussion and Agents modes will have limited functionality")
    
    # Check for misconfigured URLs (common mistake)
    for config in MODEL_CONFIG:
        env_value = os.getenv(config["env"])
        if env_value:
            if not (env_value.startswith("http://") or env_value.startswith("https://")):
                errors.append(f"{config['env']} must start with http:// or https:// (got: {env_value})")
    
    # Log results
    if errors:
        logger.error("❌ Environment validation failed:")
        for error in errors:
            logger.error(f"  - {error}")
        raise RuntimeError("Invalid environment configuration. Please check your .env file.")
    
    if warnings:
        logger.warning("⚠️  Environment validation warnings:")
        for warning in warnings:
            logger.warning(f"  - {warning}")
    
    logger.info("✓ Environment validation passed")


async def fetch_model_capacity(model_id: str, endpoint: str) -> int:
    """
    Query a model's /health/details endpoint to get its max_concurrent capacity.
    Returns the model's reported capacity, or a default of 1 if unavailable.
    """
    try:
        client = HTTPClient.get_client()
        response = await client.get(f"{endpoint}/health/details", timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            capacity = data.get("max_concurrent", 1)
            logger.info(f"✓ {model_id}: max_concurrent={capacity}")
            return capacity
        else:
            logger.warning(f"⚠️  {model_id}: health check returned {response.status_code}, using default capacity=1")
            return 1
    except Exception as e:
        logger.warning(f"⚠️  {model_id}: failed to fetch capacity ({e}), using default capacity=1")
        return 1


@app.on_event("startup")
async def startup_event():
    """Initialize resources on startup."""
    # Validate environment first
    validate_environment()
    
    HTTPClient.get_client()
    
    # Log configured model endpoints
    model_env_vars = {
        "QWEN": os.getenv("QWEN_API_URL"),
        "PHI": os.getenv("PHI_API_URL"),
        "LLAMA": os.getenv("LLAMA_API_URL"),
        "MISTRAL": os.getenv("MISTRAL_API_URL"),
        "GEMMA": os.getenv("GEMMA_API_URL"),
        "R1QWEN": os.getenv("R1QWEN_API_URL"),
        "RNJ": os.getenv("RNJ_API_URL"),
    }
    
    configured = [k for k, v in model_env_vars.items() if v]
    missing = [k for k, v in model_env_vars.items() if not v]
    
    if configured:
        logger.info(f"✓ Configured model endpoints: {', '.join(configured)}")
    if missing:
        logger.info(f"○ Optional endpoints not set: {', '.join(missing)}")
    
    # Check for GitHub token (needed for Discussion/Agents)
    if get_default_github_token():
        logger.info("✓ GitHub Models token configured")
    else:
        logger.info("○ GH_MODELS_TOKEN not set - Discussion/Agents modes may have limited functionality")

    # Fetch capacity and context length for each model
    logger.info("Querying model capacities and context lengths...")
    for model_id, endpoint in MODEL_ENDPOINTS.items():
        capacity = await fetch_model_capacity(model_id, endpoint)
        MODEL_SEMAPHORES[model_id] = asyncio.Semaphore(capacity)

        # Also fetch context length
        try:
            client = HTTPClient.get_client()
            details_response = await client.get(f"{endpoint}/health/details", timeout=5.0)
            if details_response.status_code == 200:
                details_data = details_response.json()
                if "n_ctx" in details_data:
                    LIVE_CONTEXT_LENGTHS[model_id] = details_data["n_ctx"]
                    logger.info(f"✓ {model_id}: n_ctx={details_data['n_ctx']}")
        except Exception as e:
            logger.warning(f"⚠️  {model_id}: failed to fetch n_ctx ({e})")

    if MODEL_SEMAPHORES:
        logger.info(f"✓ Initialized {len(MODEL_SEMAPHORES)} models with live configurations")

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
    Returns an 8-character MD5 hash that changes whenever file content changes.
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
        "design_tokens_css": get_file_version("design-tokens.css"),
        "reset_css": get_file_version("reset.css"),
        "typography_css": get_file_version("typography.css"),
        "layout_css": get_file_version("layout.css"),
        "navigation_css": get_file_version("components/navigation.css"),
        "buttons_css": get_file_version("components/buttons.css"),
        "cards_css": get_file_version("components/cards.css"),
        "forms_css": get_file_version("components/forms.css"),
        "badges_css": get_file_version("components/badges.css"),
        "model_selector_css": get_file_version("components/model-selector.css"),
        "modals_css": get_file_version("components/modals.css"),
        "common_css": get_file_version("common.css"),
        "chat_css": get_file_version("chat.css"),
        "settings_js": get_file_version("settings.js"),
        "content_formatter_js": get_file_version("content-formatter.js"),
        "chat_js": get_file_version("chat.js"),
        "roundtable_js": get_file_version("roundtable.js"),
        "orchestrator_js": get_file_version("orchestrator.js"),
        "verbalized_sampling_js": get_file_version("verbalized_sampling.js"),
        "confessions_js": get_file_version("confessions.js"),
        "council_js": get_file_version("council.js"),
        "model_loader_js": get_file_version("model-loader.js"),
        "model_selector_js": get_file_version("model-selector.js"),
    }

# Models ordered by capability (Dec 2025 benchmarks)
MODEL_CONFIG = (
    {  # Rank 1: Multilingual (119 langs), 1M context, reasoning, coding
        "id": "qwen3-4b",
        "name": "Qwen3 4B",
        "env": "QWEN_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["QWEN_API_URL"],
        "default": True,
        "service": "qwen",
    },
    {  # Rank 2: o1-preview level reasoning, 96.3% Codeforces
        "id": "deepseek-r1-distill-qwen-1.5b",
        "name": "DeepSeek R1 1.5B",
        "env": "R1QWEN_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["R1QWEN_API_URL"],
        "service": "r1qwen",
    },
    {  # Rank 3: On-device efficiency, reasoning, safety-aligned
        "id": "gemma-2-9b-instruct",
        "name": "Gemma 2 9B",
        "env": "GEMMA_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["GEMMA_API_URL"],
    },
    {  # Rank 4: Instruction-following, structured output, function calling
        "id": "mistral-7b-instruct-v0.3",
        "name": "Mistral 7B v0.3",
        "env": "MISTRAL_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["MISTRAL_API_URL"],
    },
    {  # Rank 5: Compact reasoning, synthetic data efficiency
        "id": "phi-3-mini",
        "name": "Phi-3 Mini",
        "env": "PHI_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["PHI_API_URL"],
    },
    {  # Rank 6: Tool-calling, agentic (70% SWE-Bench)
        "id": "rnj-1-instruct",
        "name": "RNJ-1 Instruct",
        "env": "RNJ_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["RNJ_API_URL"],
        "service": "rnj",
    },
    {  # Rank 7: Lightweight chat, creative writing, long context
        "id": "llama-3.2-3b",
        "name": "Llama 3.2-3B",
        "env": "LLAMA_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["LLAMA_API_URL"],
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
    # 1. Specific Env Var (e.g. QWEN_API_URL)
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

 

DEFAULT_MODEL_ID = next(
    (config["id"] for config in MODEL_CONFIG if config.get("default")),
    MODEL_CONFIG[0]["id"] if MODEL_CONFIG else None,
)

# Request queueing: limit concurrent requests per model to prevent overload
# Semaphores are populated at startup based on each model's reported capacity
# Models expose their max_concurrent via /health/details endpoint
MODEL_SEMAPHORES: Dict[str, asyncio.Semaphore] = {}

# Cache for live context lengths fetched from inference servers
# Keys are model IDs, values are the actual n_ctx the server is running with
LIVE_CONTEXT_LENGTHS: Dict[str, int] = {}

# Log configured endpoints at startup
logger.info("=" * 60)
logger.info("MODEL ENDPOINTS CONFIGURED:")
for model_id, endpoint in MODEL_ENDPOINTS.items():
    logger.info(f"  {model_id}: {endpoint}")

logger.info("Request queueing enabled: 1 concurrent request per model")
logger.info("=" * 60)

class ChatMessage(BaseModel):
    role: str
    content: str

class GenerationParams(BaseModel):
    max_tokens: int = 2048
    temperature: float = 0.7


class ChatRequest(GenerationParams):
    model: str
    messages: List[ChatMessage]


class MultiChatRequest(GenerationParams):
    models: List[str]
    messages: List[ChatMessage]
    github_token: Optional[str] = None  # User-provided token for API models

class ModelStatus(BaseModel):
    model: str
    status: str
    endpoint: str

class DiscussionRequest(GenerationParams):
    query: str
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen3-4b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    turns: int = 2  # Number of discussion rounds (all models participate each round)
    participants: Optional[List[str]] = None  # List of model IDs to participate (default: all local models)

class CouncilRequest(BaseModel):
    query: str
    participants: List[str]  # List of model IDs to participate in council
    chairman_model: Optional[str] = None  # Optional chairman model (defaults to first participant)
    max_tokens: int = 2048  # Max tokens per response
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    completed_responses: Optional[Dict[str, str]] = None  # Already generated responses

class OrchestratorRequest(GenerationParams):
    query: str
    max_rounds: int = 5  # Maximum orchestration rounds

class VerbalizedSamplingRequest(BaseModel):
    query: str


class ConfessionRequest(BaseModel):
    query: str




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
        # Request usage stats (prompt_tokens, completion_tokens) in the final chunk
        payload["stream_options"] = {"include_usage": True}
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

@app.get("/roundtable")
async def roundtable_interface(request: Request):
    """Serve roundtable mode interface with automatic cache busting"""
    return templates.TemplateResponse(
        "roundtable.html",
        {"request": request, **get_static_versions()}
    )

@app.get("/council")
async def council_interface(request: Request):
    """Serve council mode interface with automatic cache busting"""
    return templates.TemplateResponse(
        "council.html",
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

@app.get("/playground")
async def playground_interface():
    """Serve React Playground SPA"""
    playground_html = static_dir / "playground" / "index.html"
    return FileResponse(playground_html)

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
    Also fetches and caches the live context length from /health/details.
    """
    client = HTTPClient.get_client()
    start_time = time.time()
    
    try:
        # Test health endpoint
        health_response = await client.get(f"{endpoint}/health")

        if health_response.status_code == 200:
            health_data = health_response.json()
            
            # Try to fetch detailed health info including actual n_ctx
            try:
                details_response = await client.get(f"{endpoint}/health/details", timeout=5.0)
                if details_response.status_code == 200:
                    details_data = details_response.json()
                    if "n_ctx" in details_data:
                        LIVE_CONTEXT_LENGTHS[model_id] = details_data["n_ctx"]
                        logger.debug(f"Cached live context length for {model_id}: {details_data['n_ctx']}")
            except Exception:
                pass  # Details endpoint is optional, don't fail the health check

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
                    "response_time_ms": int((time.time() - start_time) * 1000),
                    "context_length": LIVE_CONTEXT_LENGTHS.get(model_id)
                }
            except Exception as e:
                # Health passed but inference failed
                return {
                    "status": "degraded",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "failed",
                    "error": str(e),
                    "response_time_ms": int((time.time() - start_time) * 1000),
                    "context_length": LIVE_CONTEXT_LENGTHS.get(model_id)
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


@app.get("/api/system/loadbalancer")
async def loadbalancer_status():
    """
    Load balancer status showing current capacity and active requests per model
    """
    status = {}
    for model_id, semaphore in MODEL_SEMAPHORES.items():
        endpoint = MODEL_ENDPOINTS.get(model_id, "unknown")
        status[model_id] = {
            "endpoint": endpoint,
            "configured_capacity": semaphore._bound_value,
            "active_requests": semaphore._bound_value - semaphore._value,
            "available_slots": semaphore._value,
            "utilization_percent": round(
                ((semaphore._bound_value - semaphore._value) / semaphore._bound_value * 100)
                if semaphore._bound_value > 0 else 0,
                1
            )
        }

    return {
        "timestamp": time.time(),
        "models": status,
        "total_capacity": sum(s["configured_capacity"] for s in status.values()),
        "total_active": sum(s["active_requests"] for s in status.values()),
        "total_available": sum(s["available_slots"] for s in status.values()),
    }


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
    def get_context_length(model_id: str) -> int:
        """Get context length: prefer live value from server, fall back to profile."""
        if model_id in LIVE_CONTEXT_LENGTHS:
            return LIVE_CONTEXT_LENGTHS[model_id]
        return MODEL_PROFILES.get(model_id, {}).get("context_length", 0)
    
    # Build list of local models from MODEL_CONFIG
    local_models = [
        {
            "id": config["id"],
            "name": config["name"],
            "type": "local",
            "endpoint": MODEL_ENDPOINTS.get(config["id"]),
            "default": config.get("default", False),
            "context_length": get_context_length(config["id"]),
        }
        for config in MODEL_CONFIG
    ]
    
    # Build list of API models from MODEL_PROFILES
    api_models = [
        {
            "id": model_id,
            "name": profile.get("display_name", model_id),
            "type": "api",
            "endpoint": None,  # API models use GitHub Models endpoint
            "default": False,
            "context_length": profile.get("context_length", 128000),
        }
        for model_id, profile in MODEL_PROFILES.items()
        if profile.get("model_type") == "api"
    ]
    
    return {
        "models": local_models + api_models,
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

            # Ensure choices are present
            if "choices" not in data or not data["choices"]:
                raise ValueError(f"No choices returned from model {model_id}")

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


# GitHub Models API Configuration
GITHUB_MODELS_API_URL = "https://models.github.ai/inference/chat/completions"

async def stream_github_model_response(
    model_id: str, 
    messages: list, 
    max_tokens: int, 
    temperature: float,
    github_token: str
) -> AsyncGenerator[str, None]:
    """Stream response from GitHub Models API for API models (GPT-4, DeepSeek, etc.)"""
    display_name = MODEL_PROFILES.get(model_id, {}).get("display_name", model_id)
    start_time = time.time()
    total_content = ""
    usage_data = None

    # Short-circuit models known to be invalid on GitHub Models.
    if model_id in UNSUPPORTED_GITHUB_MODELS:
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'This model is not available on GitHub Models (unknown model id). Remove it or update the id.'})}\n\n"
        return
    
    # Send initial event
    yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'start'})}\n\n"
    
    try:
        client = HTTPClient.get_client()

        # Newer OpenAI models (o1, o3, o4, gpt-5) use max_completion_tokens instead of max_tokens
        # They also don't support custom temperature (only default=1)
        is_restricted_model = any(
            pattern in model_id.lower()
            for pattern in ['o1', 'o3', 'o4', 'gpt-5']
        )

        payload = {
            "model": model_id,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True}
        }

        # These models don't support custom temperature
        if not is_restricted_model:
            payload["temperature"] = temperature

        # Use correct token parameter based on model
        if is_restricted_model:
            payload["max_completion_tokens"] = max_tokens
        else:
            payload["max_tokens"] = max_tokens

        # Apply rate limiting for GitHub Models API
        rate_limiter = await get_rate_limiter(GITHUB_MODELS_API_URL, github_token)

        # Check if we'll need to wait and inform the user BEFORE waiting
        wait_msg = await rate_limiter.check_will_wait()
        if wait_msg:
            yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'info', 'content': wait_msg})}\n\n"

        async with await rate_limiter.acquire():
            async with client.stream(
                "POST",
                GITHUB_MODELS_API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {github_token}",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                json=payload,
                timeout=120.0
            ) as response:
                if response.status_code == 429:
                    rate_limiter.record_429()

                if response.status_code != 200:
                    error_bytes = await response.aread()
                    error_raw = error_bytes.decode(errors="ignore")

                    # Detect "unknown_model" and cache to avoid repeated calls.
                    try:
                        error_json = json.loads(error_raw)
                        err_obj = error_json.get("error") or {}
                        code = str(err_obj.get("code", "")).lower()
                        msg = str(err_obj.get("message", "")).lower()
                    except Exception:
                        code = ""
                        msg = error_raw.lower()

                    if code == "unknown_model" or "unknown model" in msg:
                        UNSUPPORTED_GITHUB_MODELS.add(model_id)
                        friendly = "This model id isn't recognized by GitHub Models. It may be unavailable for your token or renamed."
                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': friendly})}\n\n"
                        return

                    error_msg = sanitize_error_message(error_raw, GITHUB_MODELS_API_URL)
                    yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': error_msg})}\n\n"
                    return

                # Record success
                rate_limiter.record_success()

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

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
        
        # Send completion event
        elapsed = time.time() - start_time
        token_count = usage_data.get("total_tokens", len(total_content.split()) * 1.3) if usage_data else len(total_content.split()) * 1.3
        
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'done', 'time': elapsed, 'total_content': total_content, 'token_estimate': int(token_count), 'usage': usage_data})}\n\n"
        
    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to GitHub Models API for {model_id}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'Request timed out. Please try again.'})}\n\n"
    except httpx.ConnectError as e:
        logger.error(f"Connection error to GitHub Models API: {e}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'Cannot connect to GitHub Models API. Check your token.'})}\n\n"
    except Exception as e:
        logger.exception(f"Unexpected error streaming from GitHub Models API for {model_id}")
        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'An unexpected error occurred.'})}\n\n"


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


async def stream_multiple_models(
    models: list, 
    messages: list, 
    max_tokens: int, 
    temperature: float,
    github_token: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream responses from multiple models, yielding chunks in real-time as they arrive.
    Supports both local models and API models (via GitHub Models API).
    """
    # Categorize models
    local_models = [m for m in models if m in MODEL_ENDPOINTS]
    api_models = [m for m in models if m in MODEL_PROFILES and MODEL_PROFILES[m].get("model_type") == "api"]
    
    # Use a queue to collect chunks from all models in real-time
    queue: asyncio.Queue = asyncio.Queue()
    active_streams = len(local_models) + len(api_models)
    completed_streams = 0
    
    if active_streams == 0:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    async def stream_local_to_queue(model_id: str):
        """Stream from a local model and put chunks into the shared queue"""
        nonlocal completed_streams
        try:
            async for chunk in stream_model_response(model_id, messages, max_tokens, temperature):
                await queue.put(chunk)
        finally:
            completed_streams += 1
            if completed_streams >= active_streams:
                await queue.put(None)

    async def stream_api_to_queue(model_id: str, token: str):
        """Stream from an API model and put chunks into the shared queue"""
        nonlocal completed_streams
        try:
            async for chunk in stream_github_model_response(model_id, messages, max_tokens, temperature, token):
                await queue.put(chunk)
        finally:
            completed_streams += 1
            if completed_streams >= active_streams:
                await queue.put(None)

    # Start all streams concurrently
    tasks = []
    
    # Local model tasks
    for model_id in local_models:
        tasks.append(asyncio.create_task(stream_local_to_queue(model_id)))
    
    # API model tasks (only if token provided)
    if github_token:
        for model_id in api_models:
            tasks.append(asyncio.create_task(stream_api_to_queue(model_id, github_token)))
    else:
        # No token - send error for API models
        for model_id in api_models:
            display_name = MODEL_PROFILES.get(model_id, {}).get("display_name", model_id)
            yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': 'GitHub token required for API models. Add it in Settings.'})}\n\n"
            completed_streams += 1
            if completed_streams >= active_streams:
                await queue.put(None)

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
    """Stream chat responses using Server-Sent Events.
    Supports both local models and API models (GPT-4, DeepSeek, etc.).
    """
    messages = serialize_messages(request.messages)
    
    # Get GitHub token from request or environment
    github_token = request.github_token or get_default_github_token()

    return StreamingResponse(
        stream_multiple_models(
            request.models, 
            messages, 
            request.max_tokens, 
            request.temperature,
            github_token
        ),
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
    temperature: float = 0.7,
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
            'openai/gpt-4.1', 'openai/gpt-4o',
            'openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-5-nano',
            'deepseek/deepseek-v3-0324', 'cohere/command-r-plus-08-2024',
            'meta/llama-3.3-70b-instruct', 'meta/llama-4-scout-17b-16e-instruct', 'meta/llama-3.1-405b-instruct'
        ]
        local_models = list(MODEL_ENDPOINTS.keys())

        selected_orchestrator = orchestrator_model or 'openai/gpt-4o'
        is_api_model = selected_orchestrator in api_models

        if is_api_model:
            # Initialize GitHub Models API orchestrator
            # Use user-provided token if available, otherwise fall back to server env var
            token = github_token or get_default_github_token()
            if not token:
                yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator. Please provide your token or contact the server admin.'})}\n\n"
                return

            # Warn if using server's default token
            if not github_token and get_default_github_token():
                yield f"data: {json.dumps({'event': 'info', 'message': 'Using default GitHub Models token. Configure your own for dedicated quota.'})}\n\n"

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


# Council Mode Endpoint

async def stream_council_events(
    query: str,
    participants: List[str],
    chairman_model: Optional[str] = None,
    max_tokens: int = 2048,
    github_token: Optional[str] = None,
    completed_responses: Optional[Dict[str, str]] = None
) -> AsyncGenerator[str, None]:
    """
    Stream council events as Server-Sent Events

    3-stage process:
    - Stage 1: All models respond independently (with streaming)
    - Stage 2: Models rank responses anonymously
    - Stage 3: Chairman synthesizes final answer
    """
    try:
        from council_engine import CouncilEngine

        # Get GitHub token
        token = github_token or get_default_github_token()
        if not token:
            yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for Council mode'})}\n\n"
            return

        # Initialize council engine
        engine = CouncilEngine(
            model_endpoints=MODEL_ENDPOINTS,
            github_token=token,
            timeout=120
        )

        # Run council process with streaming
        async for event in engine.run_council(query, participants, chairman_model, max_tokens, completed_responses=completed_responses):
            # Normalize event name for clients (council_engine emits "type"; UI expects "event")
            if "event" not in event and "type" in event:
                event = {"event": event["type"], **event}
            yield f"data: {json.dumps(event)}\n\n"

    except Exception as e:
        logger.error(f"Council Error: {e}")
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@app.post("/api/chat/council/stream")
async def council_stream(request: CouncilRequest):
    """
    Stream LLM Council process using Server-Sent Events

    3-stage process:
    1. Stage 1: All models respond independently (parallel)
    2. Stage 2: Models rank responses anonymously
    3. Stage 3: Chairman synthesizes final answer

    Request body:
    - query: User's question or request
    - participants: List of model IDs to participate
    - chairman_model: Optional chairman model (defaults to first participant)
    - github_token: Optional user GitHub token

    Stream events:
    - stage1_start: Beginning of Stage 1
    - model_response: Individual model response
    - stage1_complete: Stage 1 finished
    - stage2_start: Beginning of Stage 2
    - ranking_response: Model's ranking of responses
    - stage2_complete: Stage 2 finished with aggregate rankings
    - stage3_start: Beginning of Stage 3
    - stage3_complete: Final synthesis ready
    - council_complete: Full council process finished
    - error: Error details
    """
    return StreamingResponse(
        stream_council_events(
            query=request.query,
            participants=request.participants,
            chairman_model=request.chairman_model,
            max_tokens=request.max_tokens,
            github_token=request.github_token,
            completed_responses=request.completed_responses,
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
    max_rounds: int,
    engine: str = "auto"
) -> AsyncGenerator[str, None]:
    """
    Stream AutoGen multi-agent orchestration events

    Uses Microsoft AutoGen framework with specialist agents
    """
    try:
        choice = (engine or "auto").lower()
        if choice == "autogen" and AutoGenOrchestrator is None:
            choice = "tools"
        if choice == "auto":
            choice = "autogen" if AutoGenOrchestrator is not None else "tools"

        if choice == "autogen":
            orch = AutoGenOrchestrator()
            async for event in orch.run_orchestration(query=query, max_turns=max_rounds):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            return

        # tools (fallback or explicit)
        engine_impl = ToolOrchestrator(max_rounds=max_rounds)
        async for event in engine_impl.run_orchestration(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        return

    except Exception as e:
        logger.error(f"Orchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/chat/orchestrator/stream")
async def orchestrator_stream(payload: OrchestratorRequest, req: Request):
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
    # Choose engine via query param (?engine=autogen|tools|auto), default auto
    engine = req.query_params.get("engine", "auto")

    return StreamingResponse(
        stream_orchestrator_events(
            payload.query,
            payload.max_tokens,
            payload.temperature,
            payload.max_rounds,
            engine,
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
    model: str = "qwen3-4b",
    num_responses: int = 5,
    temperature: float = 0.8,
    max_tokens: int = 2048
):
    """
    Stream Verbalized Sampling responses using Server-Sent Events

    Implements Stanford's Verbalized Sampling technique to mitigate mode collapse
    and unlock LLM diversity by asking for a distribution of responses.

    Query parameters:
    - model: Model to use (default: qwen3-4b)
    - num_responses: Number of diverse responses (default: 5)
    - temperature: Sampling temperature for diversity (default: 0.8)
    - max_tokens: Max tokens per response (default: 2048)
    
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
    model: str = "qwen3-4b",
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
