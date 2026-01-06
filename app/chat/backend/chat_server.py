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
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Dict, List, Optional, AsyncGenerator
import uvicorn
import pathlib
from urllib.parse import urlparse

from clients.http_client import HTTPClient
from clients.model_client import ModelClient
from clients.model_profiles import MODEL_PROFILES
from constants import DEFAULT_LOCAL_ENDPOINTS
from services.health_service import fetch_model_capacity
import asyncio
from core.state import MODEL_CAPACITIES, LIVE_CONTEXT_LENGTHS
from core.config import (
    MODEL_CONFIG,
    MODEL_ENDPOINTS,
    MODEL_DISPLAY_NAMES,
    DEFAULT_MODEL_ID,
    get_endpoint
)
from middleware.error_utils import sanitize_error_message
from middleware.rate_limiter import get_rate_limiter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

model_client = ModelClient()

# Cache of GitHub Models that returned "unknown_model".
# Prevents repeated network calls/log spam for invalid IDs.
from core.state import (
    MODEL_SEMAPHORES,
    MODEL_CAPACITIES,
    LIVE_CONTEXT_LENGTHS,
    UNSUPPORTED_GITHUB_MODELS
)

# Import GitHub token utility
from utils.github_token import get_default_github_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan (startup and shutdown)."""
    # Startup
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

    # Check for GitHub token
    if get_default_github_token():
        logger.info("✓ GitHub Models token configured")
    else:
        logger.info("○ GH_MODELS_TOKEN not set - Discussion/Agents modes may have limited functionality")

    # Initialize model semaphores with default capacity during startup for immediate availability
    logger.info("Initializing model semaphores with default capacity...")
    for model_id, endpoint in MODEL_ENDPOINTS.items():
        # Initialize with default capacity of 1 to allow immediate server startup
        MODEL_SEMAPHORES[model_id] = asyncio.Semaphore(1)
        MODEL_CAPACITIES[model_id] = 1

        # Also fetch context length during startup with default
        try:
            client = HTTPClient.get_client()
            details_response = await client.get(f"{endpoint}/health/details", timeout=5.0)
            if details_response.status_code == 200:
                details_data = details_response.json()
                if "n_ctx" in details_data:
                    LIVE_CONTEXT_LENGTHS[model_id] = details_data["n_ctx"]
                    logger.info(f"✓ {model_id}: n_ctx={details_data['n_ctx']}")
        except Exception as e:
            logger.warning(f"⚠️  {model_id}: failed to fetch n_ctx during startup ({e})")

    if MODEL_SEMAPHORES:
        logger.info(f"✓ Initialized {len(MODEL_SEMAPHORES)} models with default configurations")

    # Run detailed capacity checks in the background after server startup
    logger.info("Starting background model capacity checks...")
    asyncio.create_task(update_model_capacities_async())

    # Fetch GitHub models
    from services.github_models_service import fetch_github_models
    await fetch_github_models()

    yield

    # Shutdown
    await HTTPClient.close_client()


async def update_model_capacities_async():
    """
    Update model capacities in the background after server startup.
    This allows the server to start quickly while still getting accurate capacity information.
    """
    logger.info("Background: Querying model capacities and context lengths...")

    # Create tasks for all capacity fetches to run concurrently
    tasks = []
    for model_id, endpoint in MODEL_ENDPOINTS.items():
        task = asyncio.create_task(_update_single_model_capacity(model_id, endpoint))
        tasks.append(task)

    # Wait for all capacity checks to complete
    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("Background: Completed all model capacity updates")


async def _update_single_model_capacity(model_id: str, endpoint: str):
    """
    Update capacity for a single model in the background.
    """
    try:
        capacity = await fetch_model_capacity(model_id, endpoint)

        # Update the semaphore and capacity atomically
        MODEL_CAPACITIES[model_id] = capacity

        # Replace the semaphore with a new one with updated capacity
        # Note: Any ongoing operations using the old semaphore will continue with the old capacity
        # but new operations will use the updated capacity
        MODEL_SEMAPHORES[model_id] = asyncio.Semaphore(capacity)

        # Also fetch context length in the background
        try:
            client = HTTPClient.get_client()
            details_response = await client.get(f"{endpoint}/health/details", timeout=5.0)
            if details_response.status_code == 200:
                details_data = details_response.json()
                if "n_ctx" in details_data:
                    LIVE_CONTEXT_LENGTHS[model_id] = details_data["n_ctx"]
                    logger.info(f"✓ {model_id}: n_ctx={details_data['n_ctx']}")
        except Exception as e:
            logger.warning(f"⚠️  {model_id}: failed to fetch n_ctx in background ({e})")

    except Exception as e:
        logger.error(f"Background: Error updating capacity for {model_id}: {e}")


app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="2.0.0",
    lifespan=lifespan
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


# Mount static files directory
static_dir = pathlib.Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
templates = Jinja2Templates(directory=str(static_dir))

# Include API routers
from api.routes import chat, models, debate, analyze, health

app.include_router(chat.router)
app.include_router(models.router)
app.include_router(debate.router)
app.include_router(analyze.router)
app.include_router(health.router)

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
        "modals_css": get_file_version("components/modals.css"),
        "common_css": get_file_version("common.css"),
    }

# Models ordered by capability (Dec 2025 benchmarks)


# Log configured endpoints at startup
logger.info("=" * 60)
logger.info("MODEL ENDPOINTS CONFIGURED:")
for model_id, endpoint in MODEL_ENDPOINTS.items():
    logger.info(f"  {model_id}: {endpoint}")

logger.info("Request queueing enabled: 1 concurrent request per model")
logger.info("=" * 60)

# Import Pydantic models from api.models
from api.models import (
    ChatMessage,
    GenerationParams,
    ChatRequest,
    MultiChatRequest,
    ModelStatus,
)




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
async def playground_interface():
    """Serve React Playground SPA with no-cache to ensure fresh builds are always served"""
    playground_html = static_dir / "playground" / "index.html"
    response = FileResponse(playground_html)
    # Prevent caching of index.html so new deployments are picked up immediately
    # The JS/CSS chunks have content hashes in filenames, so they can be cached forever
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.get("/status")
async def status_page(request: Request):
    """Serve health status dashboard with automatic cache busting"""
    response = templates.TemplateResponse(
        "status.html",
        {"request": request, **get_static_versions()}
    )
    # Prevent HTML caching to ensure inline CSS/JS updates are always fetched
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response





async def query_model(client: httpx.AsyncClient, model_id: str, messages: list, max_tokens: int, temperature: float):
    """Query a single model and return results with timing (with request queueing)"""
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    # Use semaphore to limit concurrent requests per model
    semaphore = MODEL_SEMAPHORES.get(model_id)
    # If no semaphore (e.g. API model or not initialized), use a dummy one
    if not semaphore:
        from contextlib import nullcontext
        semaphore = nullcontext()

    start_time = time.time()
    try:
        async with semaphore:
            # ModelClient handles the actual call (local or API)
            result = await model_client.call_model(
                model_id=model_id,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            
            elapsed = time.time() - start_time
            
            return {
                "model": display_name,
                "content": result["content"],
                "usage": result["usage"],
                "time": elapsed,
                "error": False
            }

    except Exception as e:
        logger.exception(f"Error querying {model_id}")
        return {
            "model": display_name,
            "content": str(e),
            "error": True,
            "time": time.time() - start_time
        }




async def stream_multiple_models(
    models: list,
    messages: list,
    max_tokens: int,
    temperature: float,
    github_token: Optional[str] = None,
    openrouter_key: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """Stream responses from multiple models, yielding chunks in real-time as they arrive.
    Supports both local models and API models (via GitHub Models API).
    """
    # Use a queue to collect chunks from all models in real-time
    queue: asyncio.Queue = asyncio.Queue()
    active_streams = len(models)
    completed_streams = 0

    if active_streams == 0:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    # Client to use (ModelClient instances are lightweight)
    request_client = ModelClient(github_token, openrouter_key) # Passed tokens handle API auth

    async def stream_to_queue(model_id: str):
        """Stream from a model and put chunks into the shared queue"""
        nonlocal completed_streams
        display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)
        
        # Semaphore for local concurrency
        semaphore = MODEL_SEMAPHORES.get(model_id)
        if not semaphore:
            from contextlib import nullcontext
            semaphore = nullcontext()

        try:
            async with semaphore:
                async for event in request_client.stream_model(model_id, messages, max_tokens, temperature):
                    if event["type"] == "start":
                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'start'})}\n\n"
                    
                    elif event["type"] == "chunk":
                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'content': event['content'], 'event': 'token'})}\n\n"
                    
                    elif event["type"] == "done":
                        # Estimate usage if not provided
                        usage = event.get("usage")
                        total_content = event.get("full_content", "")
                        token_count = usage.get("total_tokens") if usage else len(total_content.split()) * 1.3
                        
                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'done', 'time': 0, 'total_content': total_content, 'token_estimate': int(token_count), 'usage': usage})}\n\n"
                    
                    elif event["type"] == "error":
                         # Only yield errors as data events so frontend can display them
                        yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': event['error']})}\n\n"
                        
        except Exception as e:
             yield f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': str(e)})}\n\n"
        finally:
            # We need to signal completion to the main loop
            # But since we are yielding to a bridge, we can't easily put to queue here if we use generator
            pass

    async def bridge_stream_to_queue(model_id: str):
         nonlocal completed_streams
         try:
             async for item in stream_to_queue(model_id):
                 await queue.put(item)
         finally:
             completed_streams += 1
             if completed_streams >= active_streams:
                await queue.put(None)

    # Re-create tasks with bridge
    tasks = [asyncio.create_task(bridge_stream_to_queue(m)) for m in models]

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


# NOTE: /api/chat/stream endpoint is defined in api/routes/chat.py
# It uses stream_multiple_models() which properly handles both local and API models


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
