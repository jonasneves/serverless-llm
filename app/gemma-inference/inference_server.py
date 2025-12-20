"""
Gemma 3 12B Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Gemma 3 12B Inference API",
    description="REST API for Gemma 3 12B model inference using GGUF",
    model_name="Gemma-3-12B-Instruct",
    openai_model_id="gemma-3-12b-it",
    owned_by="google",
    default_repo="unsloth/gemma-3-12b-it-GGUF",
    default_file="gemma-3-12b-it-Q4_K_M.gguf",
    default_n_ctx=8192,
    default_n_threads=4,
    n_batch=128,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8102"))
    uvicorn.run(app, host="0.0.0.0", port=port)
