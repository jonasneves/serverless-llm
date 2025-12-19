"""
Shared constants for chat-interface defaults to avoid drift.
"""

# Local default endpoints (ports match config/models.py scheme)
# 8080: Chat, 81XX: Small, 82XX: Medium, 83XX: Reasoning
DEFAULT_LOCAL_ENDPOINTS = {
    "QWEN_API_URL": "http://localhost:8100",
    "PHI_API_URL": "http://localhost:8101",
    "FUNCTIONGEMMA_API_URL": "http://localhost:8103",
    "GEMMA_API_URL": "http://localhost:8200",
    "LLAMA_API_URL": "http://localhost:8201",
    "MISTRAL_API_URL": "http://localhost:8202",
    "RNJ_API_URL": "http://localhost:8203",
    "R1QWEN_API_URL": "http://localhost:8300",
}

# Remote hosted defaults
DEFAULT_REMOTE_ENDPOINTS = {
    "QWEN_API_URL": "https://qwen.neevs.io",
    "PHI_API_URL": "https://phi.neevs.io",
    "FUNCTIONGEMMA_API_URL": "https://functiongemma.neevs.io",
    "GEMMA_API_URL": "https://gemma.neevs.io",
    "LLAMA_API_URL": "https://llama.neevs.io",
    "MISTRAL_API_URL": "https://mistral.neevs.io",
    "RNJ_API_URL": "https://rnj.neevs.io",
    "R1QWEN_API_URL": "https://r1qwen.neevs.io",
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
