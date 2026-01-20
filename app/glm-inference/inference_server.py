"""
GLM-4.7 Flash Inference Server

Uses llama-server wrapper for Glm4MoeLiteForCausalLM architecture support.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app

config = LlamaServerConfig(
    model_id="glm-4.7-flash",
    display_name="GLM-4.7 Flash",
    owned_by="zhipu",
    default_repo="unsloth/GLM-4.7-Flash-GGUF",
    default_file="GLM-4.7-Flash-Q4_K_M.gguf",
    default_port=8302,
    n_ctx=4096,
    max_concurrent=2,
    startup_timeout=600,
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
