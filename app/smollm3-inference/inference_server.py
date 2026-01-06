"""
SmolLM3 3B Inference Server (GGUF)

SmolLM3 is HuggingFace's 3B reasoning model with:
- Hybrid reasoning mode (/think and /no_think)
- 64K native context (128K with YaRN)
- Strong tool-calling (92.3% BFCL)
"""

import os
import uvicorn
from shared.inference_base import create_app_for_model

app = create_app_for_model("smollm3")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8104"))
    uvicorn.run(app, host="0.0.0.0", port=port)
