"""
Shared constants for chat-interface defaults to avoid drift.
"""

# Local default endpoints for running everything on one machine
DEFAULT_LOCAL_ENDPOINTS = {
    "QWEN_API_URL": "http://localhost:8001",
    "PHI_API_URL": "http://localhost:8002",
    "LLAMA_API_URL": "http://localhost:8003",
    "R1QWEN_API_URL": "http://localhost:8004",
    "RNJ_API_URL": "http://localhost:8009",
    "MISTRAL_API_URL": "http://localhost:8005",
    "GEMMA_API_URL": "http://localhost:8006",
    "FUNCTIONGEMMA_API_URL": "http://localhost:8007",
}

# Remote hosted defaults (optional deployments)
DEFAULT_REMOTE_ENDPOINTS = {
    "QWEN_API_URL": "https://qwen.neevs.io",
    "PHI_API_URL": "https://phi.neevs.io",
    "LLAMA_API_URL": "https://llama.neevs.io",
    "R1QWEN_API_URL": "https://r1qwen.neevs.io",
    "RNJ_API_URL": "https://rnj.neevs.io",
}

# GitHub Models API endpoint
GITHUB_MODELS_API_URL = "https://models.github.ai/inference/chat/completions"

# Generation defaults - keep in sync with playground-app/src/constants.ts
GENERATION_DEFAULTS = {
    "max_tokens": 1024,     # Reasonable default for comparison
    "temperature": 0.7,     # Balanced creativity/coherence
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
