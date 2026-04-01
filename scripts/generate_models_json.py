#!/usr/bin/env python3
"""
Sync self-hosted entries in models.json from config/models.py.

Run directly to update models.json in place:
    python scripts/generate_models_json.py

Wired as a pre-commit hook — runs automatically when config/models.py is staged.
API model entries (type != "self-hosted") are preserved unchanged.
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
    existing = json.loads(MODELS_JSON.read_text())
    api_models = [m for m in existing["models"] if m.get("type") != "self-hosted"]
    existing["models"] = build_self_hosted() + api_models
    existing["source"] = "config/models.py"
    existing.pop("fetchedAt", None)
    MODELS_JSON.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")
    print(f"Updated {MODELS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
