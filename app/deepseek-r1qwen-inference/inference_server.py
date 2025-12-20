"""
DeepSeek-R1-Distill-Qwen-1.5B Inference Server (GGUF) via shared base
"""

import os
import sys
import uvicorn

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="DeepSeek R1 Distill Qwen 1.5B API",
    description="REST API for DeepSeek-R1-Distill-Qwen-1.5B (GGUF) via llama.cpp",
    model_name="DeepSeek-R1-Distill-Qwen-1.5B",
    openai_model_id="deepseek-r1-distill-qwen-1.5b",
    owned_by="deepseek",
    default_repo="bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
    default_file="DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
    default_n_ctx=4096,
    default_n_threads=4,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8300"))
    uvicorn.run(app, host="0.0.0.0", port=port)
