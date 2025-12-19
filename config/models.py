"""
Centralized model configuration for serverless-llm.

This is the SINGLE SOURCE OF TRUTH for:
- Port mappings
- Model metadata  
- Subdomain configuration
- Model IDs and display names

All other scripts should import from here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ModelCategory(Enum):
    """Model category for port allocation and grouping."""
    CORE = "core"
    SMALL = "small"
    MEDIUM = "medium"
    REASONING = "reasoning"


@dataclass
class ModelConfig:
    """Configuration for a single model."""
    name: str
    port: int
    subdomain: str
    category: ModelCategory
    model_id: Optional[str] = None  # API model ID (e.g., "qwen3-4b")
    display_name: Optional[str] = None  # Human-readable name
    inference_dir: Optional[str] = None  # Directory in app/ folder
    description: Optional[str] = None
    rank: int = 99  # Capability ranking (1 = best)
    default: bool = False  # Default model for auto-selection
    
    @property
    def service_url(self) -> str:
        """Local development URL."""
        return f"http://localhost:{self.port}"
    
    @property
    def env_var(self) -> str:
        """Environment variable name for this model's URL."""
        return f"{self.name.upper()}_API_URL"
    
    @property
    def internal_url(self) -> str:
        """URL for docker-compose internal networking."""
        return f"http://{self.name}:8000"
    
    def remote_url(self, domain: str) -> str:
        """Public URL for a given domain."""
        return f"https://{self.subdomain}.{domain}"


# =============================================================================
# PORT ALLOCATION SCHEME
# =============================================================================
# 8080      : Chat Interface (main app)
# 8081-8089 : Reserved for core services
# 8100-8199 : Small models (< 7B params)
# 8200-8299 : Medium models (7B-30B params)  
# 8300-8399 : Reasoning/specialty models
# =============================================================================

MODELS: dict[str, ModelConfig] = {
    # Core services
    "chat": ModelConfig(
        name="chat",
        port=8080,
        subdomain="chat",
        category=ModelCategory.CORE,
        inference_dir="chat-interface",
        description="Main chat interface and API gateway",
    ),
    
    # Small models (< 7B params)
    "qwen": ModelConfig(
        name="qwen",
        port=8100,
        subdomain="qwen",
        category=ModelCategory.SMALL,
        model_id="qwen3-4b",
        display_name="Qwen3 4B",
        inference_dir="qwen-inference",
        description="Multilingual (119 langs), 1M context, reasoning, coding",
        rank=1,
        default=True,
    ),
    "phi": ModelConfig(
        name="phi",
        port=8101,
        subdomain="phi",
        category=ModelCategory.SMALL,
        model_id="phi-3-mini",
        display_name="Phi-3 Mini",
        inference_dir="phi-inference",
        description="Compact reasoning, synthetic data efficiency",
        rank=5,
    ),
    "functiongemma": ModelConfig(
        name="functiongemma",
        port=8103,
        subdomain="functiongemma",
        category=ModelCategory.SMALL,
        model_id="functiongemma-270m-it",
        display_name="FunctionGemma 270M",
        inference_dir="functiongemma-inference",
        description="Function calling specialist, edge-optimized",
        rank=8,
    ),
    
    # Medium models (7B-30B params)
    "gemma": ModelConfig(
        name="gemma",
        port=8200,
        subdomain="gemma",
        category=ModelCategory.MEDIUM,
        model_id="gemma-2-9b-instruct",
        display_name="Gemma 2 9B",
        inference_dir="gemma-inference",
        description="On-device efficiency, reasoning, safety-aligned",
        rank=3,
    ),
    "llama": ModelConfig(
        name="llama",
        port=8201,
        subdomain="llama",
        category=ModelCategory.MEDIUM,
        model_id="llama-3.2-3b",
        display_name="Llama 3.2-3B",
        inference_dir="llama-inference",
        description="Lightweight chat, creative writing, long context",
        rank=7,
    ),
    "mistral": ModelConfig(
        name="mistral",
        port=8202,
        subdomain="mistral",
        category=ModelCategory.MEDIUM,
        model_id="mistral-7b-instruct-v0.3",
        display_name="Mistral 7B v0.3",
        inference_dir="mistral-inference",
        description="Instruction-following, structured output, function calling",
        rank=4,
    ),
    "rnj": ModelConfig(
        name="rnj",
        port=8203,
        subdomain="rnj",
        category=ModelCategory.MEDIUM,
        model_id="rnj-1-instruct",
        display_name="RNJ-1 Instruct",
        inference_dir="rnj-inference",
        description="Tool-calling, agentic (70% SWE-Bench)",
        rank=6,
    ),
    
    # Reasoning models
    "r1qwen": ModelConfig(
        name="r1qwen",
        port=8300,
        subdomain="r1qwen",
        category=ModelCategory.REASONING,
        model_id="deepseek-r1-distill-qwen-1.5b",
        display_name="DeepSeek R1 1.5B",
        inference_dir="deepseek-r1qwen-inference",
        description="o1-preview level reasoning, 96.3% Codeforces",
        rank=2,
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_model(name: str) -> ModelConfig:
    """Get model config by name."""
    if name not in MODELS:
        available = ", ".join(MODELS.keys())
        raise KeyError(f"Model '{name}' not found. Available: {available}")
    return MODELS[name]


def get_port(name: str) -> int:
    """Get port for a model."""
    return get_model(name).port


def get_subdomain(name: str) -> str:
    """Get subdomain for a model."""
    return get_model(name).subdomain


def get_models_by_category(category: ModelCategory) -> list[ModelConfig]:
    """Get all models in a category."""
    return [m for m in MODELS.values() if m.category == category]


def get_inference_models() -> list[ModelConfig]:
    """Get all inference models (excludes core services), sorted by rank."""
    models = [m for m in MODELS.values() if m.category != ModelCategory.CORE]
    return sorted(models, key=lambda m: m.rank)


def get_default_model() -> ModelConfig:
    """Get the default model for auto-selection."""
    for m in MODELS.values():
        if m.default:
            return m
    return get_inference_models()[0]


# =============================================================================
# DERIVED CONFIGURATIONS
# =============================================================================

# Port/subdomain dict for setup_tunnels.py
MODEL_CONFIGS: dict[str, dict[str, int | str]] = {
    name: {"port": config.port, "subdomain": config.subdomain}
    for name, config in MODELS.items()
}

# Local endpoint URLs
DEFAULT_LOCAL_ENDPOINTS: dict[str, str] = {
    m.env_var: m.service_url
    for m in MODELS.values() if m.category != ModelCategory.CORE
}

# Model ID to service name mapping
MODEL_ID_TO_SERVICE: dict[str, str] = {
    m.model_id: m.name
    for m in MODELS.values() if m.model_id
}


if __name__ == "__main__":
    print("Serverless LLM - Model Configuration")
    print("=" * 60)
    
    for m in get_inference_models():
        print(f"  #{m.rank} {m.display_name:<20} :{m.port}  {m.env_var}")
