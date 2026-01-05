"""
SmolLM3-3B Inference Server (GGUF) via shared base

SmolLM3 is HuggingFace's 3B reasoning model with:
- Hybrid reasoning mode (/think and /no_think)
- 64K native context (128K with YaRN)
- Strong tool-calling (92.3% BFCL)
- 6 language support
"""

import os
import sys
import uvicorn

# Ensure we can import the shared module when running as a script
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from shared.inference_base import ModelConfig, create_inference_app  # noqa: E402


config = ModelConfig(
    title="SmolLM3-3B Inference API",
    description="REST API for SmolLM3-3B model inference using GGUF",
    model_name="SmolLM3-3B",
    openai_model_id="smollm3-3b",
    owned_by="huggingfacetb",
    default_repo="unsloth/SmolLM3-3B-GGUF",
    default_file="SmolLM3-3B-Q4_K_M.gguf",
    default_n_ctx=4096,
    default_n_threads=4,
    n_batch=512,
)

app = create_inference_app(config)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8104"))
    uvicorn.run(app, host="0.0.0.0", port=port)
