"""
Centralized model configuration for serverless-llm.

This is the SINGLE SOURCE OF TRUTH for:
- Port mappings
- Model metadata
- Subdomain configuration

All other scripts should import from here.
"""

from __future__ import annotations

from dataclasses import dataclass
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
    inference_dir: Optional[str] = None  # Directory in app/ folder
    description: Optional[str] = None
    
    @property
    def service_url(self) -> str:
        return f"http://localhost:{self.port}"
    
    @property
    def internal_url(self) -> str:
        """URL for docker-compose internal networking."""
        return f"http://{self.name}:8000"


# =============================================================================
# PORT ALLOCATION SCHEME
# =============================================================================
# 8080      : Chat Interface (main app)
# 8081-8089 : Reserved for core services (admin, metrics, etc.)
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
        inference_dir="qwen-inference",
        description="Qwen 3-4B",
    ),
    "phi": ModelConfig(
        name="phi",
        port=8101,
        subdomain="phi",
        category=ModelCategory.SMALL,
        inference_dir="phi-inference",
        description="Phi 3.8B",
    ),
    "functiongemma": ModelConfig(
        name="functiongemma",
        port=8103,
        subdomain="functiongemma",
        category=ModelCategory.SMALL,
        inference_dir="functiongemma-inference",
        description="FunctionGemma (tool-calling)",
    ),
    
    # Medium models (7B-30B params)
    "gemma": ModelConfig(
        name="gemma",
        port=8200,
        subdomain="gemma",
        category=ModelCategory.MEDIUM,
        inference_dir="gemma-inference",
        description="Gemma 2 9B",
    ),
    "llama": ModelConfig(
        name="llama",
        port=8201,
        subdomain="llama",
        category=ModelCategory.MEDIUM,
        inference_dir="llama-inference",
        description="Llama 3.2 3B",
    ),
    "mistral": ModelConfig(
        name="mistral",
        port=8202,
        subdomain="mistral",
        category=ModelCategory.MEDIUM,
        inference_dir="mistral-inference",
        description="Mistral 7B",
    ),
    "rnj": ModelConfig(
        name="rnj",
        port=8203,
        subdomain="rnj",
        category=ModelCategory.MEDIUM,
        inference_dir="rnj-inference",
        description="Rocinante & Josiefied (creative)",
    ),
    
    # Reasoning models
    "r1qwen": ModelConfig(
        name="r1qwen",
        port=8300,
        subdomain="r1qwen",
        category=ModelCategory.REASONING,
        inference_dir="deepseek-r1qwen-inference",
        description="DeepSeek R1 Qwen (reasoning/CoT)",
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
    """Get all inference models (excludes core services)."""
    return [m for m in MODELS.values() if m.category != ModelCategory.CORE]


# For backward compatibility with setup_tunnels.py
MODEL_CONFIGS: dict[str, dict[str, int | str]] = {
    name: {"port": config.port, "subdomain": config.subdomain}
    for name, config in MODELS.items()
}


if __name__ == "__main__":
    # Print current configuration
    print("Serverless LLM - Port Configuration")
    print("=" * 50)
    
    for category in ModelCategory:
        models = get_models_by_category(category)
        if models:
            print(f"\n{category.value.upper()} ({len(models)} models)")
            print("-" * 40)
            for m in models:
                print(f"  {m.port}  {m.name:<15} {m.description or ''}")
