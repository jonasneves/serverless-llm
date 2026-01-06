"""
Mistral 7B v0.3 Inference Server (GGUF)
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("mistral")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8202"))
    uvicorn.run(app, host="0.0.0.0", port=port)
