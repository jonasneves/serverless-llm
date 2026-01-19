"""
LFM2.5 1.2B Inference Server

Uses llama-server wrapper due to llama-cpp-python binding incompatibilities.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app

config = LlamaServerConfig(
    model_id="lfm2.5-1.2b-instruct",
    display_name="LFM2.5 1.2B",
    owned_by="liquidai",
    default_repo="LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
    default_file="LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
    default_port=8105,
    n_ctx=4096,
    max_concurrent=6,
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
