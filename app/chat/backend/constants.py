"""
Shared constants for chat.

Ports and endpoints are derived from config/models.py (Single Source of Truth).
"""

import sys
from pathlib import Path

# Add project root to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from config.models import MODELS, get_inference_models, ModelCategory

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

# Generation defaults - keep in sync with playground-app/src/constants.ts
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
