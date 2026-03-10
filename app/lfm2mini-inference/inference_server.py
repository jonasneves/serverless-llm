import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import uvicorn
from shared.llama_server_wrapper import create_llama_server_app_for_model
from config.models import MODELS

app = create_llama_server_app_for_model("lfm2mini")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", str(MODELS["lfm2mini"].port))))
