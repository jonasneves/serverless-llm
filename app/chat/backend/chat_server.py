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

from clients.model_client import ModelClient
from clients.model_profiles import MODEL_PROFILES
from services.health_service import fetch_model_capacity
from core.config import (
    MODEL_CONFIG,
    MODEL_ENDPOINTS,
    MODEL_DISPLAY_NAMES,
    DEFAULT_MODEL_ID,
    DEFAULT_LOCAL_ENDPOINTS,
    DEFAULT_MODEL_CAPACITY,
    get_endpoint,
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
    LIVE_CONTEXT_LENGTHS,
    MODEL_CAPACITIES,
    MODEL_SEMAPHORES,
    UNSUPPORTED_GITHUB_MODELS,
    close_http_client,
    get_http_client,
    init_model_semaphores,
    update_model_capacity,
)

# Import GitHub token utility
from utils.github_token import get_default_github_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan (startup and shutdown)."""
    # Startup
    validate_environment()
    get_http_client()

    # Log configured model endpoints
    from config.models import get_inference_models
    model_env_vars = {
        model.name.upper(): os.getenv(model.env_var)
        for model in get_inference_models()
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

    # Initialize model semaphores
    await init_model_semaphores(MODEL_ENDPOINTS, DEFAULT_MODEL_CAPACITY, logger)

    # Run detailed capacity checks in background
    logger.info("Starting background model capacity checks...")
    asyncio.create_task(_update_all_model_capacities())

    # Fetch GitHub models
    from services.github_models_service import fetch_github_models
    await fetch_github_models()

    yield

    # Shutdown
    await close_http_client()


async def _update_all_model_capacities():
    """Update model capacities in the background after server startup."""
    logger.info("Background: Querying model capacities and context lengths...")
    tasks = [
        asyncio.create_task(
            update_model_capacity(model_id, endpoint, fetch_model_capacity, logger)
        )
        for model_id, endpoint in MODEL_ENDPOINTS.items()
    ]
    await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("Background: Completed all model capacity updates")


app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",  # Allow all origins for development
        # In production, you may want to restrict to:
        # "https://chat.neevs.io",  # Frontend (GitHub Pages)
    ],
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
    if not models:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    queue: asyncio.Queue = asyncio.Queue()
    done_sentinel = object()

    # Client to use (ModelClient instances are lightweight)
    request_client = ModelClient(github_token, openrouter_key)  # Passed tokens handle API auth

    async def stream_to_queue(model_id: str) -> None:
        """Stream from a model and put chunks into the shared queue."""
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
                        await queue.put(
                            f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'start'})}\n\n"
                        )
                    elif event["type"] == "chunk":
                        await queue.put(
                            f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'content': event['content'], 'event': 'token'})}\n\n"
                        )
                    elif event["type"] == "done":
                        # Estimate usage if not provided
                        usage = event.get("usage")
                        total_content = event.get("full_content", "")
                        token_count = usage.get("total_tokens") if usage else len(total_content.split()) * 1.3

                        await queue.put(
                            f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'event': 'done', 'time': 0, 'total_content': total_content, 'token_estimate': int(token_count), 'usage': usage})}\n\n"
                        )
                    elif event["type"] == "error":
                        # Only yield errors as data events so frontend can display them
                        await queue.put(
                            f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': event['error']})}\n\n"
                        )
        except Exception as e:
            await queue.put(
                f"data: {json.dumps({'model': display_name, 'model_id': model_id, 'error': True, 'content': str(e)})}\n\n"
            )
        finally:
            await queue.put(done_sentinel)

    tasks = [asyncio.create_task(stream_to_queue(m)) for m in models]

    completed = 0
    try:
        while completed < len(tasks):
            item = await queue.get()
            if item is done_sentinel:
                completed += 1
                continue
            yield item
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()

    yield f"data: {json.dumps({'event': 'all_done'})}\n\n"


# NOTE: /api/chat/stream endpoint is defined in api/routes/chat.py
# It uses stream_multiple_models() which properly handles both local and API models


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
