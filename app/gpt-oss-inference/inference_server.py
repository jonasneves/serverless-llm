"""
GPT-OSS-20B Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="GPT-OSS-20B Inference API",
    description="REST API for GPT-OSS-20B model inference using GGUF",
    model_name="GPT-OSS-20B",
    openai_model_id="gpt-oss-20b",
    owned_by="openai",
    default_repo="unsloth/gpt-oss-20b-GGUF",
    default_file="gpt-oss-20b-Q6_K.gguf",
    default_n_ctx=8192,
    default_n_threads=4,
    n_batch=128,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8302"))
    uvicorn.run(app, host="0.0.0.0", port=port)
