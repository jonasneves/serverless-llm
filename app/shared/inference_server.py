"""
Universal GGUF Inference Server Entry Point

Auto-detects model from MODEL_NAME environment variable.
All standard llama-cpp-python models use this single entry point.
"""

import os
import uvicorn
from inference_base import create_app_for_model

MODEL_NAME = os.environ.get("MODEL_NAME")
if not MODEL_NAME:
    raise RuntimeError("MODEL_NAME environment variable is required")

app = create_app_for_model(MODEL_NAME)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
