"""
Qwen3 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

# Ensure we can import the shared module when running as a script
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Qwen3 Inference API",
    description="REST API for Qwen3 model inference using GGUF",
    model_name="Qwen3-4B",
    openai_model_id="qwen3-4b",
    owned_by="qwen",
    default_repo="unsloth/Qwen3-4B-GGUF",
    default_file="Qwen3-4B-Q4_K_M.gguf",
    default_n_ctx=4096,
    default_n_threads=4,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
