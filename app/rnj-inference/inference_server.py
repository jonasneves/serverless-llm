"""
RNJ-1 Inference Server

Uses llama-server wrapper due to llama-cpp-python binding incompatibilities
(requires PR #17811).
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app

config = LlamaServerConfig(
    model_id="rnj-1-instruct",
    display_name="RNJ-1 Instruct",
    owned_by="essentialai",
    default_repo="EssentialAI/rnj-1-instruct-GGUF",
    default_file="Rnj-1-Instruct-8B-Q4_K_M.gguf",
    default_port=8203,
    n_ctx=2048,
    n_batch=512,
    max_concurrent=3,
    startup_timeout=120,
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
