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


# Aggregate profiles for easy access
MODEL_PROFILES: Dict[str, Dict[str, Any]] = {
    "qwen2.5-7b": QWEN_PROFILE,
    "phi-3-mini": PHI_PROFILE,
    "llama-3.2-3b": LLAMA_PROFILE,
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
    "QWEN_PROFILE",
    "PHI_PROFILE",
    "LLAMA_PROFILE",
    "get_model_profile",
    "get_domain_expert",
    "rank_models_for_query",
    "get_all_model_ids",
    "get_model_display_name",
    "should_model_participate",
]
