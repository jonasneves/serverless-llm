"""
Phi-3 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="Phi-3 Inference API",
    description="REST API for Microsoft Phi-3 model inference using GGUF",
    model_name="Phi-3-mini-4k-instruct",
    openai_model_id="phi-3-mini-4k-instruct",
    owned_by="microsoft",
    default_repo="microsoft/Phi-3-mini-4k-instruct-gguf",
    default_file="Phi-3-mini-4k-instruct-q4.gguf",
    default_n_ctx=4096,
    default_n_threads=4,
    n_batch=256,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8101"))
    uvicorn.run(app, host="0.0.0.0", port=port)
