"""
Model endpoint configuration for chat.

Uses config/models.py as the Single Source of Truth, with runtime
endpoint resolution based on environment variables and BASE_DOMAIN.
"""

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Add project root to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from config.models import (
    MODELS,
    ModelCategory,
    ModelConfig,
    get_default_model,
    get_inference_models,
)

# Base domain configuration for production (Cloudflare tunnels)
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


def get_endpoint(model: ModelConfig) -> str:
    """Get endpoint URL for a model.

    Priority: Environment Variable > BASE_DOMAIN > Local Default
    """
    # 1. Specific Env Var (e.g. QWEN_API_URL)
    env_value = os.getenv(model.env_var)
    if env_value:
        return env_value

    # 2. Base Domain (if configured)
    if BASE_DOMAIN:
        return f"{BASE_SCHEME}://{model.subdomain}.{BASE_DOMAIN}"

    # 3. Default Local URL
    return model.service_url


# Local default endpoints (derived from config/models.py)
DEFAULT_LOCAL_ENDPOINTS = {
    m.env_var: m.service_url
    for m in MODELS.values() if m.category != ModelCategory.CORE
}

# Remote hosted defaults (derived from config/models.py)
# Uses neevs.io as the default domain
DEFAULT_REMOTE_ENDPOINTS = {
    m.env_var: m.remote_url("neevs.io")
    for m in MODELS.values() if m.category != ModelCategory.CORE
}

# GitHub Models API endpoint
GITHUB_MODELS_API_URL = "https://models.github.ai/inference/chat/completions"

# OpenRouter API endpoint
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Default capacity for models when health checks are unavailable
DEFAULT_MODEL_CAPACITY = 2

# Generation defaults
GENERATION_DEFAULTS = {
    "max_tokens": 1024,
    "temperature": 0.7,
}

# Standard event types for streaming
EVENT_TYPES = {
    "START": "start",
    "CHUNK": "chunk",
    "TOKEN": "token",
    "DONE": "done",
    "COMPLETE": "complete",
    "ERROR": "error",
    "INFO": "info",
    "USAGE": "usage",
}


# Build MODEL_CONFIG tuple for backward compatibility
# Sorted by rank (capability)
MODEL_CONFIG = tuple(
    {
        "id": m.model_id,
        "name": m.display_name,
        "env": m.env_var,
        "default_url": m.service_url,
        "service": m.name,
        "default": m.default,
        "rank": m.rank,
    }
    for m in get_inference_models()
)

# Model endpoints dict
MODEL_ENDPOINTS = {
    m.model_id: get_endpoint(m)
    for m in get_inference_models()
}

# Display names dict
MODEL_DISPLAY_NAMES = {
    m.model_id: m.display_name
    for m in get_inference_models()
}

# Default model ID
DEFAULT_MODEL_ID = get_default_model().model_id
