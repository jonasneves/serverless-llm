#!/usr/bin/env python3
"""
Generate GitHub Actions workflows from config/inference.yaml.

This script generates .github/workflows/inference.yml with model choices
dynamically populated from the config file.

Usage:
    python scripts/generate_workflows.py
"""

import yaml
from pathlib import Path

def generate_inference_workflow():
    """Generate inference.yml with dynamic model choices"""

    # Read models from config
    config_path = Path(__file__).parent.parent / "config" / "inference.yaml"
    with open(config_path) as f:
        config = yaml.safe_load(f)

    models = sorted(config["models"].keys())

    # Generate workflow YAML
    workflow = {
        "name": "Inference Server",
        "run-name": "${{ inputs.model }} • ${{ inputs.duration_hours || '5' }}h × ${{ inputs.instances || '1' }}",
        "on": {
            "workflow_dispatch": {
                "inputs": {
                    "model": {
                        "description": "Model to run",
                        "required": True,
                        "type": "choice",
                        "options": models
                    },
                    "instances": {
                        "description": "Parallel instances (1-3)",
                        "required": False,
                        "default": "1",
                        "type": "choice",
                        "options": ["1", "2", "3"]
                    },
                    "duration_hours": {
                        "description": "Duration (max 5.5 hours)",
                        "required": False,
                        "default": "5",
                        "type": "string"
                    },
                    "auto_restart": {
                        "description": "Auto-restart before timeout",
                        "required": False,
                        "default": True,
                        "type": "boolean"
                    }
                }
            },
            "repository_dispatch": {
                "types": ["restart-inference"]
            }
        },
        "permissions": {
            "actions": "write",
            "contents": "read",
            "packages": "read"
        },
        "jobs": {
            "lookup": {
                "name": "Lookup model config",
                "runs-on": "ubuntu-latest",
                "outputs": {
                    "model_name": "${{ steps.config.outputs.model_name }}",
                    "model_dir": "${{ steps.config.outputs.model_dir }}",
                    "model_repo": "${{ steps.config.outputs.model_repo }}",
                    "model_file": "${{ steps.config.outputs.model_file }}",
                    "display_name": "${{ steps.config.outputs.display_name }}"
                },
                "steps": [
                    {"uses": "actions/checkout@v4"},
                    {
                        "name": "Read model config",
                        "id": "config",
                        "run": """sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
sudo chmod +x /usr/local/bin/yq

MODEL="${{ github.event.client_payload.model || inputs.model }}"
CONFIG_FILE="config/inference.yaml"

MODEL_DIR=$(yq ".models.$MODEL.model_dir" "$CONFIG_FILE")
MODEL_REPO=$(yq ".models.$MODEL.model_repo" "$CONFIG_FILE")
MODEL_FILE=$(yq ".models.$MODEL.model_file" "$CONFIG_FILE")
DISPLAY_NAME=$(yq ".models.$MODEL.display_name" "$CONFIG_FILE")

if [ "$MODEL_DIR" = "null" ] || [ -z "$MODEL_DIR" ]; then
  echo "Error: Model '$MODEL' not found in config/inference.yaml"
  exit 1
fi

echo "model_name=$MODEL" >> $GITHUB_OUTPUT
echo "model_dir=$MODEL_DIR" >> $GITHUB_OUTPUT
echo "model_repo=$MODEL_REPO" >> $GITHUB_OUTPUT
echo "model_file=$MODEL_FILE" >> $GITHUB_OUTPUT
echo "display_name=$DISPLAY_NAME" >> $GITHUB_OUTPUT

echo "Model: $DISPLAY_NAME"
echo "Repo: $MODEL_REPO"
echo "File: $MODEL_FILE"
"""
                    }
                ]
            },
            "inference": {
                "name": "${{ needs.lookup.outputs.display_name }}",
                "needs": "lookup",
                "uses": "./.github/workflows/reusable-inference-containerized.yml",
                "with": {
                    "model_name": "${{ needs.lookup.outputs.model_name }}",
                    "model_dir": "${{ needs.lookup.outputs.model_dir }}",
                    "model_repo": "${{ needs.lookup.outputs.model_repo }}",
                    "model_file": "${{ needs.lookup.outputs.model_file }}",
                    "cache_key_prefix": "gguf-${{ needs.lookup.outputs.model_name }}",
                    "restart_event_type": "restart-inference",
                    "workflow_file": "inference.yml",
                    "duration_hours": "${{ github.event.client_payload.duration_hours || inputs.duration_hours || '5' }}",
                    "auto_restart": "${{ (github.event.client_payload.auto_restart == true || github.event.client_payload.auto_restart == 'true') || (inputs.auto_restart == true || inputs.auto_restart == 'true' || inputs.auto_restart == '') }}",
                    "instances": "${{ github.event.client_payload.instances || inputs.instances || '1' }}"
                },
                "secrets": {
                    "hf_token": "${{ secrets.HF_TOKEN }}",
                    "tunnels_json": "${{ secrets.TUNNELS_JSON }}",
                    "workflow_pat": "${{ secrets.WORKFLOW_PAT }}"
                }
            }
        }
    }

    # Write to file
    output_path = Path(__file__).parent.parent / ".github" / "workflows" / "inference.yml"

    # Custom YAML dumper to preserve formatting
    class CustomDumper(yaml.SafeDumper):
        pass

    def str_presenter(dumper, data):
        if '\n' in data:
            return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
        return dumper.represent_scalar('tag:yaml.org,2002:str', data)

    CustomDumper.add_representer(str, str_presenter)

    with open(output_path, 'w') as f:
        yaml.dump(workflow, f, Dumper=CustomDumper, default_flow_style=False, sort_keys=False, width=120)

    print(f"✓ Generated: .github/workflows/inference.yml")
    print(f"  - {len(models)} models: {', '.join(models)}")

if __name__ == "__main__":
    generate_inference_workflow()
