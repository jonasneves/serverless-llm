"""
RNJ-1 Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

# Ensure we can import the shared module when running as a script
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="RNJ-1 Inference API",
    description="REST API for RNJ-1 model inference using GGUF",
    model_name="RNJ-1-Instruct",
    openai_model_id="rnj-1-instruct",
    owned_by="essential-ai",
    default_repo="EssentialAI/rnj-1-instruct-GGUF",
    default_file="rnj-1-instruct-Q4_K_M.gguf",
    default_n_ctx=2048,
    default_n_threads=2,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8009"))  # Using port 8009 for RNJ
    uvicorn.run(app, host="0.0.0.0", port=port)
