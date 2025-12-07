"""
Gemma 2 9B Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Gemma 2 9B Inference API",
    description="REST API for Gemma 2 9B model inference using GGUF",
    model_name="Gemma-2-9B-Instruct",
    openai_model_id="gemma-2-9b-instruct",
    owned_by="google",
    default_repo="bartowski/gemma-2-9b-it-GGUF",
    default_file="gemma-2-9b-it-Q4_K_M.gguf",
    default_n_ctx=512,  # Reduced from 2048 - 9B model needs low context for 7GB RAM
    default_n_threads=2,
    n_batch=128,  # Reduced from 512 to fit in GitHub Actions memory
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8006"))
    uvicorn.run(app, host="0.0.0.0", port=port)
