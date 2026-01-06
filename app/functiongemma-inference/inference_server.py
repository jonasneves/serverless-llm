"""
FunctionGemma 270M Inference Server (GGUF)
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("functiongemma")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8103"))
    uvicorn.run(app, host="0.0.0.0", port=port)
