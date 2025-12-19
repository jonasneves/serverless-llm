"""
Llama 3.2 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Llama 3.2 Inference API",
    description="REST API for Meta Llama 3.2 model inference using GGUF",
    model_name="Llama-3.2-3B-Instruct",
    openai_model_id="llama-3.2-3b-instruct",
    owned_by="meta",
    default_repo="bartowski/Llama-3.2-3B-Instruct-GGUF",
    default_file="Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    default_n_ctx=4096,
    default_n_threads=2,
    n_batch=256,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8200"))
    uvicorn.run(app, host="0.0.0.0", port=port)
