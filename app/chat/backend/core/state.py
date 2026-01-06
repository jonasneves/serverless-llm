from __future__ import annotations

import asyncio
import time
from typing import Dict, Set

import httpx

# Request queueing: limit concurrent requests per model to prevent overload
# Semaphores are populated at startup based on each model's reported capacity
# Models expose their max_concurrent via /health/details endpoint
MODEL_SEMAPHORES: Dict[str, asyncio.Semaphore] = {}

# Cache for configured capacities (max_concurrent) for each model
MODEL_CAPACITIES: Dict[str, int] = {}

# Cache for live context lengths fetched from inference servers
# Keys are model IDs, values are the actual n_ctx the server is running with
LIVE_CONTEXT_LENGTHS: Dict[str, int] = {}

# Cache of GitHub Models that returned "unknown_model".
# Prevents repeated network calls/log spam for invalid IDs.
UNSUPPORTED_GITHUB_MODELS: Set[str] = set()

# Track last successful inference timestamp per model
# Keys are model IDs, values are Unix timestamps (from time.time())
# Used by health checks to skip inference tests if recent activity proves model works
LAST_SUCCESSFUL_INFERENCE: Dict[str, float] = {}

# How long (in seconds) a recent inference is considered valid for health
# If inference happened within this window, health check skips the test inference
INFERENCE_FRESHNESS_WINDOW: float = 300.0  # 5 minutes

# Locks for concurrent access to mutable state
_INFERENCE_LOCK = asyncio.Lock()
_UNSUPPORTED_MODELS_LOCK = asyncio.Lock()

# Shared HTTP client for outbound requests
_HTTP_CLIENT: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a shared httpx AsyncClient for outbound requests."""
    global _HTTP_CLIENT
    if _HTTP_CLIENT is None:
        _HTTP_CLIENT = httpx.AsyncClient(
            timeout=600.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        )
    return _HTTP_CLIENT


async def close_http_client() -> None:
    """Close the shared httpx AsyncClient if it exists."""
    global _HTTP_CLIENT
    if _HTTP_CLIENT is not None:
        await _HTTP_CLIENT.aclose()
        _HTTP_CLIENT = None


async def record_successful_inference(model_id: str) -> None:
    """Record that a model just completed a successful inference."""
    async with _INFERENCE_LOCK:
        LAST_SUCCESSFUL_INFERENCE[model_id] = time.time()


async def mark_model_unsupported(model_id: str) -> None:
    """Mark a GitHub model as unsupported."""
    async with _UNSUPPORTED_MODELS_LOCK:
        UNSUPPORTED_GITHUB_MODELS.add(model_id)


def get_last_inference_age(model_id: str) -> float | None:
    """Get how long ago (in seconds) the last successful inference was for a model.
    Returns None if no inference has been recorded."""
    last_time = LAST_SUCCESSFUL_INFERENCE.get(model_id)
    if last_time is None:
        return None
    return time.time() - last_time


def is_inference_fresh(model_id: str) -> bool:
    """Check if a model has had a recent successful inference within the freshness window."""
    age = get_last_inference_age(model_id)
    if age is None:
        return False
    return age < INFERENCE_FRESHNESS_WINDOW
