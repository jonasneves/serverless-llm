"""
Nanbeige4-3B-Thinking Inference Server (GGUF) via shared base

This model is a 3B reasoning-focused model that outperforms Qwen3-14B/32B
on AIME (90%+) and GPQA-Diamond (82%). Excellent for math and step-by-step reasoning.
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Nanbeige4-3B-Thinking Inference API",
    description="REST API for Nanbeige4-3B-Thinking model - specialized for reasoning and math",
    model_name="Nanbeige4-3B-Thinking-2511",
    openai_model_id="nanbeige4-3b-thinking",
    owned_by="nanbeige",
    default_repo="bartowski/Nanbeige_Nanbeige4-3B-Thinking-2511-GGUF",
    default_file="Nanbeige_Nanbeige4-3B-Thinking-2511-Q5_K_M.gguf",  # Q5 for better reasoning quality
    default_n_ctx=8192,   # Larger context for chain-of-thought
    default_n_threads=4,
    n_batch=512,          # Faster prompt processing
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
