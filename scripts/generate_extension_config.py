#!/usr/bin/env python3
"""
Generate TypeScript/JSON configuration files from the Python source of truth.

This script ensures the Chrome extension always has up-to-date model
configuration without manual synchronization.

Usage:
    python scripts/generate_extension_config.py
    
Or via Makefile:
    make generate-configs
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from config.models import MODELS, ModelCategory, get_inference_models


def generate_services_config() -> list[dict]:
    """Generate SERVICES array for useExtensionConfig.ts"""
    services = []
    for model in get_inference_models():
        services.append({
            "key": model.name,
            "name": model.display_name or model.name.title(),
            "localPort": model.port,
            "category": model.category.value,
            "modelId": model.model_id,
            "rank": model.rank,
        })
    return services


def generate_workflows_config() -> list[dict]:
    """Generate KEY_WORKFLOWS array for DeploymentsPanel.tsx"""
    workflows = [
        {"name": "Chat", "path": "chat.yml", "category": "core"},
        {"name": "Build Images", "path": "build-push-images.yml", "category": "core"},
    ]
    
    for model in get_inference_models():
        # Workflow files are named after the model key (e.g., r1qwen-inference.yml)
        # not the inference directory (e.g., deepseek-r1qwen-inference)
        workflows.append({
            "name": model.display_name or model.name.title(),
            "path": f"{model.name}-inference.yml",
            "category": model.category.value,
            "serviceKey": model.name,
        })
    
    return workflows


def generate_models_fallback() -> list[dict]:
    """Generate models.json fallback data"""
    models = []
    
    # Local models
    for model in get_inference_models():
        models.append({
            "id": model.model_id or model.name,
            "name": model.display_name or model.name.title(),
            "type": "local",
            "priority": model.rank,
            "category": model.category.value,
        })
    
    return models


def generate_category_groups() -> list[dict]:
    """Generate category grouping configuration"""
    categories = [
        {
            "id": "core",
            "name": "Core Services",
            "description": "Main application services",
            "order": 0,
        },
        {
            "id": "small",
            "name": "Small Models (<7B)",
            "description": "Fast, lightweight models for quick responses",
            "order": 1,
        },
        {
            "id": "medium",
            "name": "Medium Models (7B-30B)",
            "description": "Balanced performance and capability",
            "order": 2,
        },
        {
            "id": "reasoning",
            "name": "Reasoning Models",
            "description": "Specialized for math, code, and complex reasoning",
            "order": 3,
        },
    ]
    return categories


def main():
    # Generate unified config
    config = {
        "services": generate_services_config(),
        "workflows": generate_workflows_config(),
        "categories": generate_category_groups(),
        "models": generate_models_fallback(),
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": "config/models.py",
    }

    # Write to frontend directory
    output_dirs = [
        project_root / "app" / "chat" / "frontend" / "src" / "data",
    ]

    for output_dir in output_dirs:
        output_dir.mkdir(parents=True, exist_ok=True)

        # Write extension-config.json
        output_file = output_dir / "extension-config.json"
        with open(output_file, "w") as f:
            json.dump(config, f, indent=2)

        # Also update the raw services.json for backwards compat
        services_file = output_dir / "services.json"
        with open(services_file, "w") as f:
            json.dump({"services": config["services"]}, f, indent=2)

    print(f"✓ Generated extension-config.json and services.json")
    print(f"  - {len(config['services'])} services")
    print(f"  - {len(config['workflows'])} workflows")
    print(f"  - {len(config['categories'])} categories")
    print(f"  - Written to: app/chat/frontend/src/data/")


if __name__ == "__main__":
    main()
