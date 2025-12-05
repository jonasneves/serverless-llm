"""
Model Expertise Profiles

Defines capabilities and benchmark performance for each model in the arena.
Used by the orchestrator to weight contributions in discussion mode.

Benchmark sources:
- Qwen 2.5-7B: https://qwenlm.github.io/blog/qwen2.5/ (official release)
- Phi-3 Mini: https://huggingface.co/microsoft/Phi-3-mini-4k-instruct (model card)
- Llama 3.2-3B: https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/ (Meta release)
"""

from typing import Dict, List, Any


# Domain expertise scores (0.0 to 1.0)
# Based on benchmark performance and model architecture

QWEN_PROFILE = {
    "model_id": "qwen2.5-7b",
    "display_name": "Qwen 2.5 7B",
    "creator": "Alibaba Cloud",
    "size": "7B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["mathematics", "coding", "logical_reasoning"],

    "benchmark_scores": {
        "MMLU": 74.2,           # Massive Multitask Language Understanding
        "HumanEval": 84.8,      # Code generation benchmark
        "MATH": 75.5,           # Mathematical problem solving
        "GSM8K": 82.3,          # Grade school math word problems
        "BigBench-Hard": 68.5,  # Complex reasoning tasks
        "GPQA": 42.3,           # Graduate-level science questions
    },

    "expertise_domains": {
        "mathematics": 0.95,           # Exceptional - top MATH and GSM8K scores
        "coding": 0.90,                # Exceptional - 84.8 HumanEval
        "logical_reasoning": 0.85,     # Strong - good BBH performance
        "scientific_knowledge": 0.80,  # Strong - decent GPQA score
        "problem_solving": 0.85,       # Strong - excels at structured problems
        "technical_writing": 0.75,     # Good - clear explanations
        "creative_writing": 0.60,      # Moderate - not primary focus
        "conversation": 0.65,          # Moderate - more technical than conversational
        "summarization": 0.70,         # Good - understands structure
        "common_sense": 0.70,          # Good - general knowledge
    },

    "use_as_lead_for": [
        "math problems",
        "code generation",
        "algorithm design",
        "data structures",
        "technical explanations",
        "data analysis",
        "scientific computing",
        "optimization problems",
    ],

    "context_length": 32768,
    "description": "Technical expert optimized for mathematics and coding tasks"
}


PHI_PROFILE = {
    "model_id": "phi-3-mini",
    "display_name": "Phi-3 Mini",
    "creator": "Microsoft",
    "size": "3.8B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["reasoning", "instruction_following", "common_sense"],

    "benchmark_scores": {
        "MMLU": 69.7,           # General knowledge
        "BigBench-Hard": 72.1,  # Complex reasoning (strong for size!)
        "HellaSwag": 73.2,      # Common sense reasoning
        "ARC-Challenge": 84.9,  # Scientific reasoning
        "PIQA": 82.1,           # Physical reasoning
        "IFEval": 80.4,         # Instruction following
        "TruthfulQA": 65.8,     # Factual accuracy
    },

    "expertise_domains": {
        "reasoning": 0.90,              # Exceptional - strong BBH despite small size
        "instruction_following": 0.88,  # Exceptional - 80.4 IFEval
        "common_sense": 0.82,           # Strong - good HellaSwag/PIQA
        "problem_solving": 0.80,        # Strong - good at step-by-step
        "logical_reasoning": 0.78,      # Good - solid reasoning ability
        "scientific_knowledge": 0.70,   # Good - decent ARC score
        "conversation": 0.68,           # Moderate - can follow dialogue
        "summarization": 0.65,          # Moderate
        "creative_writing": 0.60,       # Moderate - not primary focus
        "mathematics": 0.60,            # Moderate - not specialized
        "coding": 0.55,                 # Moderate - basic ability
        "factual_knowledge": 0.55,      # Limited - smaller model, watch for hallucination
    },

    "use_as_lead_for": [
        "logic puzzles",
        "step-by-step reasoning",
        "instruction clarification",
        "decision making",
        "comparative analysis",
        "common sense questions",
        "ethical reasoning",
        "strategy problems",
    ],

    "context_length": 4096,
    "description": "Reasoning specialist with strong instruction following despite compact size"
}


LLAMA_PROFILE = {
    "model_id": "llama-3.2-3b",
    "display_name": "Llama 3.2 3B",
    "creator": "Meta",
    "size": "3B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["conversation", "summarization", "creative_writing"],

    "benchmark_scores": {
        "MMLU": 63.4,               # General knowledge
        "NIH Multi-needle": 84.7,   # Long context understanding (strong!)
        "IFEval": 71.5,             # Instruction following
        "HellaSwag": 70.8,          # Common sense
        "Winogrande": 68.5,         # Commonsense reasoning
        "GSM8K": 51.2,              # Math (weaker)
        "HumanEval": 39.6,          # Code (weaker)
    },

    "expertise_domains": {
        "conversation": 0.85,       # Strong - designed for chat
        "summarization": 0.80,      # Strong - excellent context handling
        "creative_writing": 0.75,   # Good - natural generation
        "natural_language": 0.80,   # Strong - fluent output
        "storytelling": 0.75,       # Good - creative tasks
        "brainstorming": 0.70,      # Good - idea generation
        "common_sense": 0.68,       # Moderate - decent HellaSwag
        "instruction_following": 0.65, # Moderate - 71.5 IFEval
        "text_completion": 0.75,    # Good - strong generation
        "paraphrasing": 0.72,       # Good - understands language
        "reasoning": 0.50,          # Weak - not specialized
        "mathematics": 0.40,        # Weak - 51.2 GSM8K
        "coding": 0.45,             # Weak - 39.6 HumanEval
        "complex_reasoning": 0.50,  # Weak - smaller model limitations
    },

    "use_as_lead_for": [
        "casual conversation",
        "text summarization",
        "creative writing",
        "brainstorming ideas",
        "storytelling",
        "natural dialogue",
        "content paraphrasing",
        "simple Q&A",
    ],

    "context_length": 131072,  # Very large context window!
    "description": "Conversationalist with excellent summarization and creative writing abilities"
}


# API Model Profiles (GitHub Models API)

GPT4_1_PROFILE = {
    "model_id": "gpt-4.1",
    "display_name": "GPT-4.1",
    "creator": "OpenAI",
    "size": "~1.76T parameters (estimated)",
    "quantization": None,
    "primary_strengths": ["reasoning", "coding", "instruction_following"],
    "expertise_domains": {
        "mathematics": 0.95,
        "coding": 0.98,
        "logical_reasoning": 0.95,
        "scientific_knowledge": 0.92,
        "problem_solving": 0.95,
        "technical_writing": 0.90,
        "creative_writing": 0.88,
        "conversation": 0.92,
        "summarization": 0.90,
        "common_sense": 0.90,
        "reasoning": 0.95,
        "instruction_following": 0.95,
    },
    "context_length": 128000,
    "description": "OpenAI's most capable model with excellent reasoning and coding abilities"
}

GPT4O_PROFILE = {
    "model_id": "gpt-4o",
    "display_name": "GPT-4o",
    "creator": "OpenAI",
    "size": "~200B parameters (estimated)",
    "quantization": None,
    "primary_strengths": ["speed", "coding", "conversation"],
    "expertise_domains": {
        "mathematics": 0.90,
        "coding": 0.92,
        "logical_reasoning": 0.88,
        "scientific_knowledge": 0.85,
        "problem_solving": 0.88,
        "technical_writing": 0.85,
        "creative_writing": 0.85,
        "conversation": 0.90,
        "summarization": 0.88,
        "common_sense": 0.88,
        "reasoning": 0.88,
        "instruction_following": 0.90,
    },
    "context_length": 128000,
    "description": "OpenAI's optimized multimodal model, fast and capable"
}

DEEPSEEK_V3_PROFILE = {
    "model_id": "deepseek-v3-0324",
    "display_name": "DeepSeek V3",
    "creator": "DeepSeek",
    "size": "671B parameters (MoE)",
    "quantization": None,
    "primary_strengths": ["coding", "mathematics", "reasoning"],
    "expertise_domains": {
        "mathematics": 0.95,
        "coding": 0.95,
        "logical_reasoning": 0.92,
        "scientific_knowledge": 0.88,
        "problem_solving": 0.90,
        "technical_writing": 0.82,
        "creative_writing": 0.75,
        "conversation": 0.78,
        "summarization": 0.80,
        "common_sense": 0.82,
        "reasoning": 0.92,
        "instruction_following": 0.85,
    },
    "context_length": 128000,
    "description": "DeepSeek's flagship MoE model, excels at technical tasks"
}

LLAMA_33_70B_PROFILE = {
    "model_id": "llama-3.3-70b-instruct",
    "display_name": "Llama 3.3 70B",
    "creator": "Meta",
    "size": "70B parameters",
    "quantization": None,
    "primary_strengths": ["reasoning", "conversation", "coding"],
    "expertise_domains": {
        "mathematics": 0.85,
        "coding": 0.88,
        "logical_reasoning": 0.88,
        "scientific_knowledge": 0.85,
        "problem_solving": 0.85,
        "technical_writing": 0.82,
        "creative_writing": 0.80,
        "conversation": 0.90,
        "summarization": 0.85,
        "common_sense": 0.88,
        "reasoning": 0.88,
        "instruction_following": 0.85,
    },
    "context_length": 128000,
    "description": "Meta's latest large-scale instruct model with strong general capabilities"
}


# New Local Model Profiles

MISTRAL_7B_PROFILE = {
    "model_id": "mistral-7b-instruct-v0.3",
    "display_name": "Mistral 7B v0.3",
    "creator": "Mistral AI",
    "size": "7B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["instruction_following", "structured_output", "reasoning"],

    "benchmark_scores": {
        "MMLU": 70.6,           # General knowledge
        "HellaSwag": 81.3,      # Common sense reasoning
        "ARC-Challenge": 79.2,  # Scientific reasoning
        "TruthfulQA": 73.5,     # Factual accuracy
        "GSM8K": 52.2,          # Math word problems
        "HumanEval": 40.2,      # Code generation
    },

    "expertise_domains": {
        "instruction_following": 0.92,  # Exceptional - Mistral's core strength
        "structured_output": 0.90,      # Exceptional - JSON, function calling
        "reasoning": 0.82,              # Strong - good logical flow
        "logical_reasoning": 0.80,      # Strong
        "common_sense": 0.78,           # Good - HellaSwag score
        "conversation": 0.75,           # Good - natural dialogue
        "technical_writing": 0.72,      # Good
        "problem_solving": 0.70,        # Good
        "summarization": 0.68,          # Moderate
        "scientific_knowledge": 0.65,   # Moderate
        "mathematics": 0.60,            # Moderate - not specialized
        "coding": 0.58,                 # Moderate - basic ability
        "creative_writing": 0.70,       # Good
    },

    "use_as_lead_for": [
        "function calling",
        "structured data extraction",
        "JSON generation",
        "instruction clarification",
        "task decomposition",
        "agent coordination",
        "tool use planning",
    ],

    "context_length": 32768,
    "description": "Efficient 7B model excelling at instruction following and structured outputs"
}

QWEN_14B_PROFILE = {
    "model_id": "qwen2.5-14b-instruct",
    "display_name": "Qwen 2.5 14B",
    "creator": "Alibaba Cloud",
    "size": "14B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["mathematics", "coding", "logical_reasoning"],

    "benchmark_scores": {
        "MMLU": 79.9,           # Massive Multitask Language Understanding
        "HumanEval": 87.3,      # Code generation benchmark
        "MATH": 80.7,           # Mathematical problem solving
        "GSM8K": 88.5,          # Grade school math word problems
        "BigBench-Hard": 74.2,  # Complex reasoning tasks
        "GPQA": 48.1,           # Graduate-level science questions
    },

    "expertise_domains": {
        "mathematics": 0.98,           # Exceptional - top-tier MATH scores
        "coding": 0.95,                # Exceptional - 87.3 HumanEval
        "logical_reasoning": 0.90,     # Exceptional - strong BBH
        "scientific_knowledge": 0.85,  # Strong - good GPQA
        "problem_solving": 0.90,       # Exceptional
        "technical_writing": 0.82,     # Strong
        "instruction_following": 0.85, # Strong
        "reasoning": 0.88,             # Strong
        "creative_writing": 0.65,      # Moderate
        "conversation": 0.70,          # Good
        "summarization": 0.75,         # Good
        "common_sense": 0.75,          # Good
    },

    "use_as_lead_for": [
        "complex math problems",
        "advanced code generation",
        "algorithm optimization",
        "data structures design",
        "scientific computing",
        "technical documentation",
        "mathematical proofs",
        "competitive programming",
    ],

    "context_length": 32768,
    "description": "Advanced technical expert with exceptional mathematics and coding abilities"
}

GEMMA2_9B_PROFILE = {
    "model_id": "gemma-2-9b-instruct",
    "display_name": "Gemma 2 9B",
    "creator": "Google",
    "size": "9B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["reasoning", "instruction_following", "safety"],

    "benchmark_scores": {
        "MMLU": 71.3,           # General knowledge
        "HumanEval": 51.8,      # Code generation
        "GSM8K": 68.6,          # Math word problems
        "HellaSwag": 80.9,      # Common sense
        "MMLU-Pro": 42.8,       # Advanced reasoning
        "TruthfulQA": 76.2,     # Factual accuracy (strong!)
    },

    "expertise_domains": {
        "reasoning": 0.85,              # Strong - good MMLU-Pro
        "instruction_following": 0.85,  # Strong - well-tuned
        "safety": 0.90,                 # Exceptional - Google's focus
        "factual_accuracy": 0.82,       # Strong - TruthfulQA
        "common_sense": 0.80,           # Strong - HellaSwag
        "logical_reasoning": 0.78,      # Good
        "conversation": 0.75,           # Good
        "problem_solving": 0.72,        # Good
        "mathematics": 0.70,            # Good - 68.6 GSM8K
        "coding": 0.65,                 # Moderate - 51.8 HumanEval
        "scientific_knowledge": 0.68,   # Moderate
        "technical_writing": 0.70,      # Good
        "creative_writing": 0.72,       # Good
        "summarization": 0.75,          # Good
    },

    "use_as_lead_for": [
        "safe content generation",
        "fact-checking",
        "educational content",
        "general reasoning tasks",
        "balanced perspectives",
        "ethical considerations",
        "policy-compliant responses",
    ],

    "context_length": 8192,
    "description": "Well-rounded 9B model with strong reasoning and safety guarantees"
}

NANOCHAT_D32_PROFILE = {
    "model_id": "nanochat-d34-base",
    "display_name": "Nanochat d34",
    "creator": "Andrej Karpathy",
    "size": "1.9B parameters",
    "quantization": "Q4_K_M", # Assuming common quantization for local models

    "primary_strengths": ["conversation", "creative_writing", "text_completion"],

    "benchmark_scores": {
        # Not explicitly provided for base model, will omit for now.
        # This would be filled in after benchmarking.
    },

    "expertise_domains": {
        "conversation": 0.70,
        "creative_writing": 0.65,
        "text_completion": 0.70,
        "common_sense": 0.60,
        "summarization": 0.55,
        "reasoning": 0.50,
        "instruction_following": 0.50,
        "mathematics": 0.40,
        "coding": 0.40,
    },

    "use_as_lead_for": [
        "casual conversation",
        "short story generation",
        "text prompting",
        "brainstorming ideas",
    ],

    "context_length": 4096, # Assuming a typical context length for a ~2B model
    "description": "nanochat d34 by Andrej Karpathy, better baseline for conversational tasks and text completion."
}


# Aggregate profiles for easy access
MODEL_PROFILES: Dict[str, Dict[str, Any]] = {
    # Local models
    "qwen2.5-7b": QWEN_PROFILE,
    "phi-3-mini": PHI_PROFILE,
    "llama-3.2-3b": LLAMA_PROFILE,
    "mistral-7b-instruct-v0.3": MISTRAL_7B_PROFILE,
    "qwen2.5-14b-instruct": QWEN_14B_PROFILE,
    "gemma-2-9b-instruct": GEMMA2_9B_PROFILE,
    "nanochat-d34-base": NANOCHAT_D32_PROFILE,
    # API models
    "gpt-4.1": GPT4_1_PROFILE,
    "gpt-4o": GPT4O_PROFILE,
    "deepseek-v3-0324": DEEPSEEK_V3_PROFILE,
    "llama-3.3-70b-instruct": LLAMA_33_70B_PROFILE,
}


def get_model_profile(model_id: str) -> Dict[str, Any]:
    """
    Get profile for a specific model

    Args:
        model_id: Model identifier

    Returns:
        Model profile dictionary

    Raises:
        ValueError: If model_id not found
    """
    if model_id not in MODEL_PROFILES:
        raise ValueError(f"Unknown model: {model_id}. Available: {list(MODEL_PROFILES.keys())}")
    return MODEL_PROFILES[model_id]


def get_domain_expert(domain: str) -> str:
    """
    Get the best model for a specific domain

    Args:
        domain: Domain name (e.g., "mathematics", "conversation")

    Returns:
        Model ID with highest expertise in that domain
    """
    best_model = None
    best_score = 0.0

    for model_id, profile in MODEL_PROFILES.items():
        score = profile["expertise_domains"].get(domain, 0.0)
        if score > best_score:
            best_score = score
            best_model = model_id

    return best_model or "qwen2.5-7b"  # Default to Qwen


def rank_models_for_query(domain_weights: Dict[str, float]) -> List[tuple[str, float]]:
    """
    Rank models by weighted expertise across domains

    Args:
        domain_weights: Dict mapping domain -> weight (should sum to 1.0)

    Returns:
        List of (model_id, score) tuples, sorted by score descending
    """
    model_scores = {}

    for model_id, profile in MODEL_PROFILES.items():
        score = 0.0
        for domain, weight in domain_weights.items():
            expertise = profile["expertise_domains"].get(domain, 0.0)
            score += expertise * weight
        model_scores[model_id] = score

    return sorted(model_scores.items(), key=lambda x: x[1], reverse=True)


def get_all_model_ids() -> List[str]:
    """Get list of all available model IDs"""
    return list(MODEL_PROFILES.keys())


def get_model_display_name(model_id: str) -> str:
    """Get human-readable name for model"""
    profile = get_model_profile(model_id)
    return profile["display_name"]


def should_model_participate(
    model_id: str,
    domain_weights: Dict[str, float],
    threshold: float = 0.5
) -> bool:
    """
    Determine if a model should participate based on domain match

    Args:
        model_id: Model to check
        domain_weights: Query domain weights
        threshold: Minimum weighted expertise score to participate

    Returns:
        True if model's weighted expertise >= threshold
    """
    profile = get_model_profile(model_id)
    weighted_score = sum(
        profile["expertise_domains"].get(domain, 0.0) * weight
        for domain, weight in domain_weights.items()
    )
    return weighted_score >= threshold


# Export for convenience
__all__ = [
    "MODEL_PROFILES",
    # Local models
    "QWEN_PROFILE",
    "PHI_PROFILE",
    "LLAMA_PROFILE",
    "MISTRAL_7B_PROFILE",
    "QWEN_14B_PROFILE",
    "GEMMA2_9B_PROFILE",
    "NANOCHAT_D32_PROFILE",
    # API models
    "GPT4_1_PROFILE",
    "GPT4O_PROFILE",
    "DEEPSEEK_V3_PROFILE",
    "LLAMA_33_70B_PROFILE",
    # Functions
    "get_model_profile",
    "get_domain_expert",
    "rank_models_for_query",
    "get_all_model_ids",
    "get_model_display_name",
    "should_model_participate",
]
