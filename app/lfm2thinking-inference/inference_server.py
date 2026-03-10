"""
LFM2.5 1.2B Thinking Inference Server

flash_attn and kv_cache_quant are disabled in ModelConfig: LiquidAI's hybrid
LFM2.5 design causes llama_decode -1 with either enabled.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import uvicorn
from shared.llama_server_wrapper import create_llama_server_app_for_model
from config.models import MODELS

app = create_llama_server_app_for_model("lfm2thinking")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", str(MODELS["lfm2thinking"].port))))
