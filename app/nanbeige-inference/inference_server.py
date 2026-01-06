"""
Nanbeige4-3B-Thinking Inference Server (GGUF)

Top-ranked reasoning model that outperforms Qwen3-14B/32B
on AIME (90%+) and GPQA-Diamond (82%). Excellent for math
and step-by-step reasoning.
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("nanbeige")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8301"))
    uvicorn.run(app, host="0.0.0.0", port=port)
