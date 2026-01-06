"""
DeepSeek R1 Distill Qwen 1.5B Inference Server (GGUF)

Reasoning-focused model distilled from DeepSeek R1.
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("r1qwen")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8300"))
    uvicorn.run(app, host="0.0.0.0", port=port)
