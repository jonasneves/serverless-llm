"""
Mistral 7B v0.3 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Mistral 7B Inference API",
    description="REST API for Mistral 7B v0.3 model inference using GGUF",
    model_name="Mistral-7B-Instruct-v0.3",
    openai_model_id="mistral-7b-instruct-v0.3",
    owned_by="mistralai",
    default_repo="bartowski/Mistral-7B-Instruct-v0.3-GGUF",
    default_file="Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    default_n_ctx=2048,
    default_n_threads=2,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8005"))
    uvicorn.run(app, host="0.0.0.0", port=port)
