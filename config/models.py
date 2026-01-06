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
    # HuggingFace model source (for llama-cpp-python models)
    hf_repo: Optional[str] = None  # e.g., "unsloth/Qwen3-4B-GGUF"
    hf_file: Optional[str] = None  # e.g., "Qwen3-4B-Q4_K_M.gguf"
    owned_by: Optional[str] = None  # e.g., "qwen", "microsoft"
    
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
        inference_dir="chat",
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
        description="Multilingual (119 langs), 262K context, reasoning, coding",
        rank=2,
        default=True,
        hf_repo="unsloth/Qwen3-4B-GGUF",
        hf_file="Qwen3-4B-Q4_K_M.gguf",
        owned_by="qwen",
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
        rank=7,
        hf_repo="microsoft/Phi-3-mini-4k-instruct-gguf",
        hf_file="Phi-3-mini-4k-instruct-q4.gguf",
        owned_by="microsoft",
    ),
    "functiongemma": ModelConfig(
        name="functiongemma",
        port=8103,
        subdomain="functiongemma",
        category=ModelCategory.SMALL,
        model_id="functiongemma-270m-it",
        display_name="FunctionGemma 270M",
        inference_dir="functiongemma-inference",
        description="Function calling specialist, edge-optimized (50 t/s on Pixel 8)",
        rank=10,
        hf_repo="unsloth/functiongemma-2b-it-GGUF",
        hf_file="functiongemma-2b-it-Q4_K_M.gguf",
        owned_by="google",
    ),
    "smollm3": ModelConfig(
        name="smollm3",
        port=8104,
        subdomain="smollm3",
        category=ModelCategory.SMALL,
        model_id="smollm3-3b",
        display_name="SmolLM3 3B",
        inference_dir="smollm3-inference",
        description="Hybrid reasoning (36.7% AIME), tool-calling (92.3% BFCL), 64K context",
        rank=3,
        hf_repo="unsloth/SmolLM3-3B-GGUF",
        hf_file="SmolLM3-3B-Q4_K_M.gguf",
        owned_by="huggingfacetb",
    ),
    
    # Medium models (7B-30B params)
    "gemma": ModelConfig(
        name="gemma",
        port=8200,
        subdomain="gemma",
        category=ModelCategory.MEDIUM,
        model_id="gemma-3-12b-it",
        display_name="Gemma 3 12B",
        inference_dir="gemma-inference",
        description="Gemma 3 IT, stronger instruction-following and safety with ~8K context",
        rank=5,
        hf_repo="unsloth/gemma-3-12b-it-GGUF",
        hf_file="gemma-3-12b-it-Q4_K_M.gguf",
        owned_by="google",
    ),
    "llama": ModelConfig(
        name="llama",
        port=8201,
        subdomain="llama",
        category=ModelCategory.MEDIUM,
        model_id="llama-3.2-3b",
        display_name="Llama 3.2-3B",
        inference_dir="llama-inference",
        description="MMLU 63.4%, 128K context, multilingual",
        rank=9,
        hf_repo="unsloth/Llama-3.2-3B-Instruct-GGUF",
        hf_file="Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        owned_by="meta",
    ),
    "mistral": ModelConfig(
        name="mistral",
        port=8202,
        subdomain="mistral",
        category=ModelCategory.MEDIUM,
        model_id="mistral-7b-instruct-v0.3",
        display_name="Mistral 7B v0.3",
        inference_dir="mistral-inference",
        description="MMLU 63%, 32K context, native function calling",
        rank=6,
        hf_repo="bartowski/Mistral-7B-Instruct-v0.3-GGUF",
        hf_file="Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
        owned_by="mistralai",
    ),
    "rnj": ModelConfig(
        name="rnj",
        port=8203,
        subdomain="rnj",
        category=ModelCategory.MEDIUM,
        model_id="rnj-1-instruct",
        display_name="RNJ-1 Instruct",
        inference_dir="rnj-inference",
        description="Tool-calling, agentic (20.8% SWE-Bench Verified)",
        rank=8,
        hf_repo="EssentialAI/rnj-1-instruct-GGUF",
        hf_file="Rnj-1-Instruct-8B-Q4_K_M.gguf",
        owned_by="essentialai",
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
        description="Math reasoning (83.9% MATH-500), Codeforces 954 rating",
        rank=4,
        hf_repo="unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
        hf_file="DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
        owned_by="deepseek",
    ),
    "nanbeige": ModelConfig(
        name="nanbeige",
        port=8301,
        subdomain="nanbeige",
        category=ModelCategory.REASONING,
        model_id="nanbeige4-3b-thinking",
        display_name="Nanbeige4-3B Thinking",
        inference_dir="nanbeige-inference",
        description="AIME 90.4%, GPQA 82.2%, outperforms Qwen3-32B on reasoning",
        rank=1,
        hf_repo="bartowski/Nanbeige_Nanbeige4-3B-Thinking-2511-GGUF",
        hf_file="Nanbeige_Nanbeige4-3B-Thinking-2511-Q4_K_M.gguf",
        owned_by="nanbeige",
    ),
    "nemotron": ModelConfig(
        name="nemotron",
        port=8302,
        subdomain="nemotron",
        category=ModelCategory.REASONING,
        model_id="nemotron-3-nano-30b-a3b",
        display_name="Nemotron-3 Nano 30B",
        inference_dir="nemotron-inference",
        description="MoE hybrid (Mamba2+Transformer), 30B params / 3.5B active",
        rank=11,
        hf_repo="unsloth/Nemotron-3-Nano-30B-A3B-GGUF",
        hf_file="Nemotron-3-Nano-30B-A3B-UD-IQ2_M.gguf",
        owned_by="nvidia",
    ),
    "gptoss": ModelConfig(
        name="gptoss",
        port=8303,
        subdomain="gptoss",
        category=ModelCategory.REASONING,
        model_id="gpt-oss-20b",
        display_name="GPT-OSS 20B",
        inference_dir="gpt-oss-inference",
        description="MoE (21B params / 3.6B active), function calling, agentic operations",
        rank=12,
        hf_repo="unsloth/gpt-oss-20b-GGUF",
        hf_file="gpt-oss-20b-Q6_K.gguf",
        owned_by="openai",
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
