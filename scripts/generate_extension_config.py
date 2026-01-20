#!/usr/bin/env python3
"""
Generate configuration files from the Python source of truth.

Updates:
- Frontend JSON configs (extension-config.json, services.json)
- .shipctl/apps.json manifest
- .github/workflows/inference.yml model options

Usage:
    python scripts/generate_extension_config.py

Or via Makefile:
    make build
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from config.models import get_inference_models


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
        workflows.append({
            "name": model.display_name or model.name.title(),
            "path": model.workflow_file or "inference.yml",
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


def update_inference_workflow(model_names: list[str]) -> bool:
    """Update inference.yml workflow with current model list."""
    workflow_file = project_root / ".github" / "workflows" / "inference.yml"
    if not workflow_file.exists():
        print(f"⚠ Workflow not found: {workflow_file}")
        return False

    content = workflow_file.read_text()

    # Build the new options block (sorted alphabetically)
    sorted_names = sorted(model_names)
    new_options = "        options:\n" + "\n".join(f"        - {name}" for name in sorted_names)

    # Replace the options block in the model input section
    # Match from "options:" up to the next input parameter (instances:)
    pattern = r"(        type: choice\n)(        options:\n(?:        - \w+\n)+)"
    replacement = r"\1" + new_options + "\n"

    new_content, count = re.subn(pattern, replacement, content, count=1)

    if count == 0:
        print(f"⚠ Could not find model options block in {workflow_file}")
        return False

    workflow_file.write_text(new_content)
    return True


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

    # Write to local frontend directory (internal consumption)
    output_dirs = [
        project_root / "app" / "chat" / "frontend" / "src" / "data",
    ]

    # Write to standard ShipCTL Manifest location
    manifest_dir = project_root / ".shipctl"
    manifest_dir.mkdir(exist_ok=True)
    manifest_file = manifest_dir / "apps.json"

    # Generate Manifest
    with open(manifest_file, "w") as f:
        json.dump(config, f, indent=2)
    print(f"✓ Generated Manifest: .shipctl/apps.json")

    # Update local frontend configs
    for output_dir in output_dirs:
        output_dir.mkdir(parents=True, exist_ok=True)

        # Write extension-config.json (legacy name for internal usage)
        output_file = output_dir / "extension-config.json"
        with open(output_file, "w") as f:
            json.dump(config, f, indent=2)

        # Also update the raw services.json for backwards compat
        services_file = output_dir / "services.json"
        with open(services_file, "w") as f:
            json.dump({"services": config["services"]}, f, indent=2)

    print(f"✓ Updated frontend configs")

    # Update inference.yml workflow
    model_names = [m.name for m in get_inference_models()]
    if update_inference_workflow(model_names):
        print(f"✓ Updated .github/workflows/inference.yml")

    print(f"  {len(config['services'])} models configured")


if __name__ == "__main__":
    main()
