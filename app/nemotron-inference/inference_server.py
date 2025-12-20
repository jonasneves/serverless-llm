"""
Nemotron-3-Nano-30B-A3B Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Nemotron-3-Nano-30B-A3B Inference API",
    description="REST API for Nemotron-3-Nano-30B-A3B model inference using GGUF",
    model_name="Nemotron-3-Nano-30B-A3B",
    openai_model_id="nemotron-3-nano-30b-a3b",
    owned_by="nvidia",
    default_repo="unsloth/Nemotron-3-Nano-30B-A3B-GGUF",
    default_file="Nemotron-3-Nano-30B-A3B-Q4_K_M.gguf",
    default_n_ctx=8192,
    default_n_threads=2,
    n_batch=128,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8301"))
    uvicorn.run(app, host="0.0.0.0", port=port)
