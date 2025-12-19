import os
from urllib.parse import urlparse
from constants import DEFAULT_LOCAL_ENDPOINTS

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
    {  # Rank 8: Function calling specialist, edge-optimized
        "id": "functiongemma-270m-it",
        "name": "FunctionGemma 270M",
        "env": "FUNCTIONGEMMA_API_URL",
        "default_url": DEFAULT_LOCAL_ENDPOINTS["FUNCTIONGEMMA_API_URL"],
        "service": "functiongemma",
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
