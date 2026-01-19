"""
Nemotron-3-Nano-30B-A3B Inference Server

Uses llama-server wrapper due to llama-cpp-python binding incompatibilities
(requires llama.cpp master PR #18058 for nemotron_h_moe architecture).

30B MoE model with aggressive optimizations for CPU inference.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app

config = LlamaServerConfig(
    model_id="nemotron-3-nano-30b-a3b",
    display_name="Nemotron-3 Nano 30B",
    owned_by="nvidia",
    default_repo="unsloth/Nemotron-3-Nano-30B-A3B-GGUF",
    default_file="Nemotron-3-Nano-30B-A3B-UD-IQ2_M.gguf",
    default_port=8302,
    n_ctx=512,
    n_batch=256,
    max_concurrent=1,
    startup_timeout=600,
    extra_args=["--cache-type-k", "q8_0", "--cache-type-v", "q8_0"],
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
