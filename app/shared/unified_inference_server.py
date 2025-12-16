"""
Unified Inference Server - Single entrypoint for all GGUF models

Usage:
    MODEL_NAME=qwen python3 unified_inference_server.py

Environment variables:
    MODEL_NAME - Required. Model identifier from models_config.yaml
    PORT - Optional. Server port (default: 8000)
"""

import os
import sys
import yaml
from pathlib import Path

import uvicorn

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from shared.inference_base import ModelConfig, create_inference_app


def load_model_config(model_name: str) -> dict:
    """Load model configuration from YAML file."""
    config_path = Path(__file__).parent / "models_config.yaml"

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path) as f:
        configs = yaml.safe_load(f)

    if model_name not in configs:
        available = ", ".join(configs.keys())
        raise ValueError(f"Unknown model '{model_name}'. Available: {available}")

    return configs[model_name]


def main():
    model_name = os.getenv("MODEL_NAME")
    if not model_name:
        print("ERROR: MODEL_NAME environment variable is required", file=sys.stderr)
        print("Example: MODEL_NAME=qwen python3 unified_inference_server.py", file=sys.stderr)
        sys.exit(1)

    # Load model config from YAML
    config_dict = load_model_config(model_name)

    # Create ModelConfig instance
    config = ModelConfig(**config_dict)

    # Create FastAPI app
    app = create_inference_app(config)

    # Run server
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
