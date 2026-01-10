#!/usr/bin/env python3
"""
Unified tunnel token retrieval for local and CI environments.

Usage:
    # From tunnels.json file (local):
    python scripts/get_tunnel_token.py qwen

    # From JSON string (CI - pass as argument):
    python scripts/get_tunnel_token.py --json '{"qwen": {...}}' qwen

    # From environment variable (CI - set TUNNELS_JSON):
    TUNNELS_JSON='{"qwen": {...}}' python scripts/get_tunnel_token.py qwen
"""

from __future__ import annotations

import json
import sys
import os
import argparse
from pathlib import Path


def find_tunnels_file() -> str | None:
    """Find tunnels.json in common locations."""
    script_dir = Path(__file__).parent
    possible_paths = [
        Path("tunnels.json"),
        script_dir.parent / "tunnels.json",
        script_dir / "tunnels.json",
    ]
    for path in possible_paths:
        if path.exists():
            return str(path)
    return None


def get_token_from_json(json_str: str, model_name: str) -> str | None:
    """Extract tunnel token from JSON string."""
    try:
        config = json.loads(json_str)
        if not isinstance(config, dict):
            return None
        model_config = config.get(model_name, {})
        if not isinstance(model_config, dict):
            return None
        token = model_config.get("tunnel_token", "")
        return token if token and isinstance(token, str) else None
    except (json.JSONDecodeError, TypeError):
        return None


def get_token_from_file(file_path: str, model_name: str) -> str | None:
    """Extract tunnel token from file."""
    try:
        with open(file_path, "r") as f:
            return get_token_from_json(f.read(), model_name)
    except (FileNotFoundError, IOError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Get tunnel token for a model (works locally and in CI)"
    )
    parser.add_argument(
        "model",
        help="Model name (e.g., qwen, gemma, r1qwen)",
    )
    parser.add_argument(
        "--json",
        dest="json_str",
        help="JSON string containing tunnels config (alternative to file)",
    )
    parser.add_argument(
        "--file",
        dest="config_file",
        help="Path to tunnels.json file (default: auto-detect)",
    )
    parser.add_argument(
        "--silent",
        action="store_true",
        help="Exit silently with code 1 instead of printing errors",
    )

    args = parser.parse_args()
    model_name = args.model

    # Priority: --json > TUNNELS_JSON env > --file > auto-detect
    token = None

    if args.json_str:
        token = get_token_from_json(args.json_str, model_name)

    if not token:
        env_json = os.environ.get("TUNNELS_JSON", "")
        if env_json:
            token = get_token_from_json(env_json, model_name)

    if not token and args.config_file:
        token = get_token_from_file(args.config_file, model_name)

    if not token:
        file_path = find_tunnels_file()
        if file_path:
            token = get_token_from_file(file_path, model_name)

    if token:
        print(token)
        sys.exit(0)
    else:
        if not args.silent:
            print(f"Error: No tunnel token found for model '{model_name}'", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
