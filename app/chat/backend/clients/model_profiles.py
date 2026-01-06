"""
Model Expertise Profiles

Defines capabilities and benchmark performance for each model in the arena.
Used by the orchestrator to weight contributions in discussion mode.

Benchmark sources:
- Qwen3-4B: https://qwenlm.github.io/blog/qwen3/ (official release)
- Phi-3 Mini: https://huggingface.co/microsoft/Phi-3-mini-4k-instruct (model card)
- Llama 3.2-3B: https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/ (Meta release)
"""

from typing import Dict, List, Any


# Domain expertise scores (0.0 to 1.0)
# Based on benchmark performance and model architecture

QWEN_PROFILE = {
    "model_id": "qwen3-4b",
    "display_name": "Qwen3 4B",
    "model_type": "self-hosted",
    "creator": "Alibaba Cloud",
    "size": "4B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["multilingual", "reasoning", "coding", "agent_capabilities", "long_context"],

    # Dec 2025 benchmarks - Rank 1 among local models (~85% avg)
    "benchmark_scores": {
        "MMLU": 73.0,           # Strong general knowledge
        "MMLU-Pro": 85.0,       # Advanced reasoning
        "HumanEval": 82.0,      # Strong code generation
        "MATH": 78.0,           # Mathematical reasoning
        "GSM8K": 85.0,          # Math word problems with thinking mode
        "BigBench-Hard": 72.0,  # Complex reasoning
        "GPQA": 44.0,           # Graduate-level science
    },

    "expertise_domains": {
        "multilingual": 0.98,          # Exceptional - 119 languages supported
        "reasoning": 0.95,             # Exceptional - thinking mode enhances reasoning
        "mathematics": 0.93,           # Exceptional
        "coding": 0.90,                # Exceptional
        "logical_reasoning": 0.92,     # Exceptional - thinking mode advantage
        "agent_capabilities": 0.95,    # Exceptional - designed for tool calling
        "long_context": 0.95,          # Exceptional - up to 1M tokens
        "problem_solving": 0.90,       # Exceptional
        "instruction_following": 0.88, # Strong
        "technical_writing": 0.80,     # Strong
        "scientific_knowledge": 0.78,  # Good
        "conversation": 0.75,          # Good
        "creative_writing": 0.70,      # Good
        "summarization": 0.75,         # Good
        "common_sense": 0.75,          # Good
    },

    "use_as_lead_for": [
        "complex reasoning with thinking mode",
        "multilingual tasks (119 languages)",
        "long document analysis",
        "math problems",
        "code generation",
        "agent tasks and tool calling",
        "algorithm design",
        "step-by-step problem solving",
        "technical explanations",
    ],

    "context_length": 1000000,  # 1M tokens with YaRN, native 32K
    "description": "Frontier 4B model: multilingual (119 langs), 1M context, thinking mode, exceptional reasoning"
}


PHI_PROFILE = {
    "model_id": "phi-3-mini",
    "display_name": "Phi-3 Mini",
    "model_type": "self-hosted",
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
    "display_name": "Llama 3.2-3B",
    "model_type": "self-hosted",
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
    "model_id": "openai/gpt-4.1",
    "display_name": "GPT-4.1",
    "model_type": "github",
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
    "model_id": "openai/gpt-4o",
    "display_name": "GPT-4o",
    "model_type": "github",
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

GPT5_PROFILE = {
    "model_id": "openai/gpt-5",
    "display_name": "GPT-5",
    "model_type": "github",
    "creator": "OpenAI",
    "size": "Unknown",
    "quantization": None,
    "primary_strengths": ["reasoning", "creativity", "multimodal"],
    "expertise_domains": {
        "reasoning": 0.99,
        "coding": 0.99,
        "mathematics": 0.99,
        "creative_writing": 0.98,
        "scientific_knowledge": 0.98,
        "conversation": 0.98,
    },
    "context_length": 200000,
    "description": "Next-generation flagship model with state-of-the-art capabilities across all domains"
}

GPT5_MINI_PROFILE = {
    "model_id": "openai/gpt-5-mini",
    "display_name": "GPT-5 Mini",
    "model_type": "github",
    "creator": "OpenAI",
    "size": "Unknown",
    "quantization": None,
    "primary_strengths": ["speed", "efficiency", "reasoning"],
    "expertise_domains": {
        "reasoning": 0.95,
        "coding": 0.94,
        "mathematics": 0.92,
        "conversation": 0.95,
    },
    "context_length": 128000,
    "description": "Efficient version of GPT-5, balancing speed and high intelligence"
}

GPT5_NANO_PROFILE = {
    "model_id": "openai/gpt-5-nano",
    "display_name": "GPT-5 Nano",
    "model_type": "github",
    "creator": "OpenAI",
    "size": "Unknown",
    "quantization": None,
    "primary_strengths": ["speed", "cost", "simple_tasks"],
    "expertise_domains": {
        "reasoning": 0.88,
        "conversation": 0.90,
        "summarization": 0.90,
    },
    "context_length": 64000,
    "description": "Ultra-fast, lightweight model for high-volume simple tasks"
}

COHERE_COMMAND_R_PLUS_PROFILE = {
    "model_id": "azureml-cohere/Cohere-command-r-plus-08-2024",
    "display_name": "Cohere Command R+",
    "model_type": "github",
    "creator": "Cohere",
    "size": "104B",
    "quantization": None,
    "primary_strengths": ["rag", "tool_use", "business_writing"],
    "expertise_domains": {
        "technical_writing": 0.95,
        "summarization": 0.95,
        "conversation": 0.90,
        "reasoning": 0.90,
    },
    "context_length": 128000,
    "description": "Optimized for RAG, tool use, and enterprise tasks"
}

LLAMA_4_SCOUT_PROFILE = {
    "model_id": "azureml-meta/Llama-4-Scout-17B-16E-Instruct",
    "display_name": "Llama 4 Scout 17B",
    "model_type": "github",
    "creator": "Meta",
    "size": "17B",
    "quantization": None,
    "primary_strengths": ["reasoning", "planning", "agentic_flow"],
    "expertise_domains": {
        "reasoning": 0.92,
        "problem_solving": 0.90,
        "logical_reasoning": 0.93,
    },
    "context_length": 128000,
    "description": "Specialized reasoning model designed for agentic workflows and planning"
}

LLAMA_3_1_405B_PROFILE = {
    "model_id": "azureml-meta/Llama-3.1-405B-Instruct",
    "display_name": "Llama 3.1 405B",
    "model_type": "github",
    "creator": "Meta",
    "size": "405B",
    "quantization": None,
    "primary_strengths": ["general_knowledge", "reasoning", "multilingual"],
    "expertise_domains": {
        "scientific_knowledge": 0.96,
        "reasoning": 0.95,
        "coding": 0.92,
        "creative_writing": 0.94,
    },
    "context_length": 128000,
    "description": "A massive open-weights model with frontier-class performance"
}

DEEPSEEK_V3_PROFILE = {
    "model_id": "deepseek/DeepSeek-V3-0324",  # GitHub Models uses {publisher}/{model} format
    "display_name": "DeepSeek V3",
    "model_type": "github",
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
    "model_id": "azureml-meta/Llama-3.3-70B-Instruct",
    "display_name": "Llama 3.3 70B",
    "model_type": "github",
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
    "model_type": "self-hosted",
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

 

GEMMA3_12B_PROFILE = {
    "model_id": "gemma-3-12b-it",
    "display_name": "Gemma 3 12B",
    "model_type": "self-hosted",
    "creator": "Google",
    "size": "12B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["reasoning", "instruction_following", "safety"],

    "benchmark_scores": {
        # Gemma 3 metrics (update when official evals are published)
        "MMLU": 71.3,
        "HumanEval": 51.8,
        "GSM8K": 68.6,
        "HellaSwag": 80.9,
        "MMLU-Pro": 42.8,
        "TruthfulQA": 76.2,
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
    "description": "Gemma 3 IT checkpoint with stronger instruction following and safety",
    "no_system_role": True,  # Gemma doesn't support system role in message format
}

# DeepSeek R1 Distill Qwen 1.5B (local, GGUF)
DEEPSEEK_R1_QWEN15B_PROFILE = {
    "model_id": "deepseek-r1-distill-qwen-1.5b",
    "display_name": "DeepSeek R1 1.5B",
    "model_type": "self-hosted",
    "creator": "DeepSeek x Alibaba",
    "size": "1.5B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["reasoning", "mathematics", "coding", "chain_of_thought"],

    # Dec 2025 benchmarks - Rank 2 (~84% avg), o1-preview level reasoning
    "benchmark_scores": {
        "GSM8K": 85.0,          # Math word problems
        "MATH": 78.0,           # Mathematical reasoning
        "HumanEval": 80.0,      # Code generation
        "Codeforces": 96.3,     # Beat 96.3% of human competitors
        "MMLU-Pro": 84.0,       # Advanced reasoning
    },

    "expertise_domains": {
        "reasoning": 0.94,             # Exceptional - o1-preview level
        "chain_of_thought": 0.95,      # Exceptional - core strength
        "logical_reasoning": 0.92,     # Exceptional
        "mathematics": 0.90,           # Exceptional
        "coding": 0.88,                # Strong - 96.3% Codeforces
        "problem_solving": 0.90,       # Exceptional
        "instruction_following": 0.82, # Strong
        "technical_writing": 0.78,     # Good
        "summarization": 0.70,         # Moderate
        "creative_writing": 0.62,      # Moderate
        "conversation": 0.70,          # Moderate
        "common_sense": 0.75,          # Good
    },

    "use_as_lead_for": [
        "step-by-step reasoning",
        "math word problems",
        "algorithmic thinking",
        "competitive programming",
        "code explanation",
        "error analysis",
        "proof verification",
    ],

    "context_length": 32768,
    "description": "R1-distilled reasoning: o1-preview level math/logic, 96.3% Codeforces performance",
    "outputs_thinking": True,  # Model starts in thinking mode (no explicit <think> tag)
}


# RNJ-1 Instruct (local, GGUF)
RNJ_1_PROFILE = {
    "model_id": "rnj-1-instruct",
    "display_name": "RNJ-1 Instruct",
    "model_type": "self-hosted",
    "creator": "Essential AI",
    "size": "8B parameters",
    "quantization": "Q4_K_M",

    "primary_strengths": ["tool_calling", "agentic_capabilities", "code_execution"],

    # Based on Dec 2025 benchmarks
    "benchmark_scores": {
        "SWE-Bench": 70.0,       # Strong agentic performance
        "MMLU": 68.0,            # General knowledge
        "HumanEval": 62.0,       # Code generation
        "GSM8K": 58.0,           # Math word problems
    },

    "expertise_domains": {
        "tool_calling": 0.92,           # Exceptional - GPT-4 comparable
        "agentic_capabilities": 0.90,   # Exceptional - designed for automation
        "code_execution": 0.85,         # Strong - good at running/testing code
        "coding": 0.75,                 # Good
        "instruction_following": 0.78,  # Good
        "reasoning": 0.72,              # Good
        "logical_reasoning": 0.70,      # Good
        "problem_solving": 0.75,        # Good
        "conversation": 0.68,           # Moderate
        "mathematics": 0.62,            # Moderate
        "creative_writing": 0.58,       # Moderate
        "summarization": 0.65,          # Moderate
        "common_sense": 0.68,           # Moderate
    },

    "use_as_lead_for": [
        "tool calling",
        "automation workflows",
        "API integrations",
        "code execution tasks",
        "multi-step agent tasks",
        "system integrations",
    ],

    "context_length": 8192,
    "description": "Agentic model with GPT-4 comparable tool-calling and 70% SWE-Bench performance"
}


# FunctionGemma 270M (local, GGUF)
FUNCTIONGEMMA_270M_PROFILE = {
    "model_id": "functiongemma-270m-it",
    "display_name": "FunctionGemma 270M",
    "model_type": "self-hosted",
    "creator": "Google",
    "size": "270M parameters",
    "quantization": "Q8_0",

    "primary_strengths": ["function_calling", "edge_deployment", "action_execution", "tool_use"],

    # Based on Dec 2025 release - specialized for function calling
    "benchmark_scores": {
        "Mobile Actions": 58.0,      # Baseline (85% after fine-tuning)
        "Function Calling": 85.0,    # After fine-tuning on specific domain
    },

    "expertise_domains": {
        "function_calling": 0.95,         # Exceptional - core specialization
        "tool_use": 0.92,                 # Exceptional - designed for API actions
        "action_execution": 0.90,         # Exceptional - translates NL to actions
        "edge_deployment": 0.95,          # Exceptional - optimized for edge devices
        "structured_output": 0.88,        # Strong - JSON function calls
        "instruction_following": 0.85,    # Strong - understands commands
        "agent_capabilities": 0.88,       # Strong - acts as independent agent
        "multilingual": 0.75,              # Good - Gemma's 256k vocabulary
        "reasoning": 0.70,                 # Moderate - lightweight model
        "conversation": 0.65,              # Moderate - can summarize results
        "coding": 0.60,                    # Moderate - basic ability
        "mathematics": 0.55,               # Moderate - not specialized
        "creative_writing": 0.50,          # Limited - not designed for this
    },

    "use_as_lead_for": [
        "function calling",
        "API action execution",
        "edge device agents",
        "mobile actions",
        "tool orchestration",
        "system automation",
        "offline agent tasks",
        "local-first deployments",
    ],

    "context_length": 4096,
    "description": "Specialized 270M model for function calling and edge deployment - transforms natural language into executable API actions",
}


# OpenRouter GLM Models
GLM_45_AIR_PROFILE = {
    "model_id": "z-ai/glm-4.5-air:free",
    "display_name": "GLM-4.5-Air (Free)",
    "model_type": "external",
    "creator": "Z.AI",
    "provider": "openrouter",

    "primary_strengths": ["reasoning", "coding", "agent_capabilities", "tool_use"],

    "expertise_domains": {
        "reasoning": 0.92,
        "coding": 0.90,
        "agent_capabilities": 0.95,
        "tool_use": 0.93,
        "mathematics": 0.88,
        "logical_reasoning": 0.90,
        "conversation": 0.85,
        "instruction_following": 0.88,
    },

    "context_length": 131072,  # 131K tokens
    "description": "Lightweight MoE model with thinking mode for reasoning and tool use",
}


# Aggregate profiles for easy access (ordered by capability rank)
MODEL_PROFILES: Dict[str, Dict[str, Any]] = {
    # Local models (ranked by Dec 2025 benchmarks)
    "qwen3-4b": QWEN_PROFILE,                                  # Rank 1
    "deepseek-r1-distill-qwen-1.5b": DEEPSEEK_R1_QWEN15B_PROFILE,  # Rank 2
    "gemma-3-12b-it": GEMMA3_12B_PROFILE,                      # Rank 3
    "mistral-7b-instruct-v0.3": MISTRAL_7B_PROFILE,            # Rank 4
    "phi-3-mini": PHI_PROFILE,                                 # Rank 5
    "rnj-1-instruct": RNJ_1_PROFILE,                           # Rank 6
    "llama-3.2-3b": LLAMA_PROFILE,                             # Rank 7
    "functiongemma-270m-it": FUNCTIONGEMMA_270M_PROFILE,       # Rank 8
    # API models
    "openai/gpt-4.1": GPT4_1_PROFILE,
    "openai/gpt-4o": GPT4O_PROFILE,
    "openai/gpt-5": GPT5_PROFILE,
    "openai/gpt-5-mini": GPT5_MINI_PROFILE,
    "openai/gpt-5-nano": GPT5_NANO_PROFILE,
    "deepseek/deepseek-v3-0324": DEEPSEEK_V3_PROFILE,
    "cohere/cohere-command-r-plus-08-2024": COHERE_COMMAND_R_PLUS_PROFILE,
    "meta/llama-3.3-70b-instruct": LLAMA_33_70B_PROFILE,
    "meta/llama-4-scout-17b-16e-instruct": LLAMA_4_SCOUT_PROFILE,
    "meta/meta-llama-3.1-405b-instruct": LLAMA_3_1_405B_PROFILE,
    # OpenRouter models
    "z-ai/glm-4.5-air:free": GLM_45_AIR_PROFILE,
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

    return best_model or "qwen3-4b"  # Default to Qwen


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


def get_display_name(model_id: str) -> str:
    """
    Get human-readable display name for a model ID.
    Convenience wrapper with fallback to model_id if not found.
    
    Args:
        model_id: Model identifier
        
    Returns:
        Human-readable display name, or model_id if profile not found
    """
    return MODEL_PROFILES.get(model_id, {}).get("display_name", model_id)


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
    # Local models (ranked by capability)
    "QWEN_PROFILE",
    "DEEPSEEK_R1_QWEN15B_PROFILE",
    "GEMMA3_12B_PROFILE",
    "MISTRAL_7B_PROFILE",
    "PHI_PROFILE",
    "RNJ_1_PROFILE",
    "LLAMA_PROFILE",
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
