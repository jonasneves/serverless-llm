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
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Dict, List, Optional, AsyncGenerator
import uvicorn
import pathlib
from urllib.parse import urlparse

from http_client import HTTPClient
from constants import DEFAULT_LOCAL_ENDPOINTS
from services.health_service import fetch_model_capacity
from core.config import (
    MODEL_CONFIG,

    MODEL_ENDPOINTS,
    MODEL_DISPLAY_NAMES,
    DEFAULT_MODEL_ID,
    get_endpoint
)

# Discussion mode imports
from orchestrator import GitHubModelsOrchestrator
from discussion_engine import DiscussionEngine
from model_profiles import MODEL_PROFILES



# Verbalized Sampling mode imports
# Removed
from error_utils import sanitize_error_message
from rate_limiter import get_rate_limiter


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from model_client import ModelClient
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
        MODEL_CAPACITIES[model_id] = capacity

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

# Include API routers
from api.routes import chat, models, discussion, council, health, personality

app.include_router(chat.router)
app.include_router(models.router)
app.include_router(discussion.router)
app.include_router(council.router)
app.include_router(health.router)
app.include_router(personality.router)

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
    CouncilRequest,
    DiscussionRequest,
    PersonalityRequest,
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
    """Serve React Playground SPA"""
    playground_html = static_dir / "playground" / "index.html"
    return FileResponse(playground_html)

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
    github_token: Optional[str] = None
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
    request_client = ModelClient(github_token) # Passed token handles API auth

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



# ===== VERBALIZED SAMPLING MODE =====
# Removed


# ===== CONFESSIONS MODE =====
# Removed


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
