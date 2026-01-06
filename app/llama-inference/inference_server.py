"""
Llama 3.2 3B Inference Server (GGUF)
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("llama")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8201"))
    uvicorn.run(app, host="0.0.0.0", port=port)
