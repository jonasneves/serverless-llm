"""
FunctionGemma 270M Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="FunctionGemma 270M Inference API",
    description="REST API for FunctionGemma 270M model inference using GGUF - specialized for function calling",
    model_name="FunctionGemma-270M-IT",
    openai_model_id="functiongemma-270m-it",
    owned_by="google",
    default_repo="ggml-org/functiongemma-270m-it-GGUF",
    default_file="functiongemma-270m-it-q8_0.gguf",
    default_n_ctx=4096,
    default_n_threads=2,
    n_batch=256,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8103"))
    uvicorn.run(app, host="0.0.0.0", port=port)

