#!/usr/bin/env python3
"""
Sync self-hosted entries in models.json from config/models.py.

Run directly to update models.json in place:
    python scripts/generate_models_json.py

Also used by app/chat/frontend/scripts/fetch-models.mjs at build time:
it calls this script and parses its stdout as JSON (local models only).
Both usages are supported: the script writes models.json in place AND
prints the self-hosted models list to stdout for the build pipeline.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from config.models import get_inference_models

MODELS_JSON = ROOT / "app/chat/frontend/public/models.json"


def build_self_hosted():
    return [
        {
            "id": m.model_id,
            "key": m.name,
            "name": m.display_name,
            "type": "self-hosted",
            "priority": m.rank,
            "context_length": m.n_ctx,
            "owned_by": m.owned_by,
            "description": m.description,
            "routing_category": m.routing_category,
        }
        for m in get_inference_models()
    ]


def main():
    self_hosted = build_self_hosted()

    # Update models.json in place, preserving API models
    existing = json.loads(MODELS_JSON.read_text())
    api_models = [m for m in existing["models"] if m.get("type") != "self-hosted"]
    existing["models"] = self_hosted + api_models
    existing["source"] = "config/models.py"
    existing.pop("fetchedAt", None)
    MODELS_JSON.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")

    # Print self-hosted list as JSON for fetch-models.mjs (build pipeline)
    print(json.dumps({"models": self_hosted, "source": "config/models.py"}, indent=2))


if __name__ == "__main__":
    main()
