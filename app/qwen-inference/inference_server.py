"""
Qwen2.5 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

# Ensure we can import the shared module when running as a script
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Qwen2.5 Inference API",
    description="REST API for Qwen2.5 model inference using GGUF",
    model_name="Qwen2.5-7B-Instruct",
    openai_model_id="qwen2.5-7b-instruct",
    owned_by="qwen",
    default_repo="bartowski/Qwen2.5-7B-Instruct-GGUF",
    default_file="Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    default_n_ctx=2048,
    default_n_threads=2,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
