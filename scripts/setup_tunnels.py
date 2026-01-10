#!/usr/bin/env python3
"""
Automated Tunnel Setup Script

Sets up tunnels for all models defined in config/models.py.
Can be run locally or in GitHub Actions.
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.cloudflare_tunnel_manager import CloudflareTunnelManager
from config.models import MODEL_CONFIGS


# Port mapping for Cloudflare Tunnels (what the tunnel connects to)
# GitHub Actions runs inference models on port 8000, chat on 8080
TUNNEL_PORTS = {
    "chat": 8080,  # Chat interface
    # All inference models use port 8000 in GitHub Actions
}


def get_tunnel_port(model_name: str) -> int:
    """Get the port that Cloudflare tunnel should connect to.

    For GitHub Actions deployment:
    - Chat interface runs on port 8080
    - All inference models run on port 8000 (each on separate runner)
    """
    return TUNNEL_PORTS.get(model_name, 8000)


def _try_add_github_secret(secret_json: str) -> bool:
    """Try to add secret to GitHub using gh CLI. Returns True if successful."""
    try:
        # Check if gh CLI is available
        result = subprocess.run(
            ["gh", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return False

        # Check if authenticated
        result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return False

        # Add the secret
        process = subprocess.Popen(
            ["gh", "secret", "set", "TUNNELS_JSON"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = process.communicate(input=secret_json, timeout=10)

        return process.returncode == 0

    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        return False


def setup_all_tunnels(
    domain: str,
    models: list[str] | None = None,
    no_auto_secret: bool = False
) -> None:
    """Setup tunnels for all or specified models."""
    api_token = os.getenv("CLOUDFLARE_API_TOKEN")
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")

    if not api_token or not account_id:
        print("Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set")
        sys.exit(1)

    manager = CloudflareTunnelManager(api_token, account_id)
    zone_id = manager.get_zone_id(domain)

    models_to_setup = models or list(MODEL_CONFIGS.keys())
    results: dict[str, dict] = {}

    for model_name in models_to_setup:
        if model_name not in MODEL_CONFIGS:
            print(f"⚠️  Skipping unknown model: {model_name}")
            continue

        config = MODEL_CONFIGS[model_name]
        tunnel_name = f"serverless-llm-{model_name}"
        subdomain = config["subdomain"]
        port = get_tunnel_port(model_name)
        service_url = f"http://localhost:{port}"

        try:
            print(f"\n{'='*60}")
            print(f"Setting up tunnel for: {model_name}")
            print(f"{'='*60}")

            # Check if tunnel exists
            existing = manager.get_tunnel_by_name(tunnel_name)
            if existing:
                print(f"✓ Tunnel exists: {existing['id']}")
                tunnel_id = existing["id"]

                # Get token
                token_result = manager._request("GET", f"cfd_tunnel/{tunnel_id}/token")
                result_data = token_result.get("result", {})

                # Handle different response formats
                if isinstance(result_data, dict):
                    tunnel_token = result_data.get("token", "")
                elif isinstance(result_data, str):
                    tunnel_token = result_data
                else:
                    raise ValueError(f"Unexpected token result format: {type(result_data)}")

                if not tunnel_token:
                    raise ValueError("Failed to retrieve tunnel token")
            else:
                print(f"Creating tunnel: {tunnel_name}...")
                tunnel_id, tunnel_token = manager.create_tunnel(tunnel_name)
                print(f"✓ Tunnel created: {tunnel_id}")

            # Create route
            print(f"Creating route: {subdomain}.{domain} -> {service_url}...")
            manager.create_route(tunnel_id, subdomain, domain, service_url)
            print(f"✓ Route configured")

            # Create DNS record
            print(f"Configuring DNS record: {subdomain}.{domain}...")
            try:
                dns_record = manager.ensure_dns_record(zone_id, subdomain, domain, tunnel_id)
                if dns_record:
                    print(f"✓ DNS record configured")
                else:
                    print(f"⚠️  DNS record may already exist or be auto-managed")
            except Exception as dns_error:
                # Check for 400 Bad Request (often means record is auto-managed)
                error_str = str(dns_error)
                if "400" in error_str or "Bad Request" in error_str:
                    print(f"⚠️  DNS record update skipped (may be auto-managed)")
                else:
                    print(f"⚠️  DNS record warning: {dns_error}")

            results[model_name] = {
                "tunnel_id": tunnel_id,
                "tunnel_name": tunnel_name,
                "subdomain": subdomain,
                "domain": domain,
                "service_url": service_url,
                "tunnel_token": tunnel_token,
                "url": f"https://{subdomain}.{domain}",
            }

            print(f"✓ {model_name} setup complete: https://{subdomain}.{domain}")

        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(f"❌ Error setting up {model_name}: {error_msg} ({error_type})")
            if os.getenv("DEBUG"):
                import traceback
                traceback.print_exc()
            results[model_name] = {"error": error_msg, "error_type": error_type}

    # Save results
    output_file = "tunnels.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nSetup complete. Results saved to: {output_file}")

    # Auto-prepare secret output
    valid_results = {k: v for k, v in results.items() if "error" not in v}
    if valid_results:
        # In GitHub Actions, mask tokens before outputting
        is_github_actions = os.getenv("GITHUB_ACTIONS") == "true"
        if is_github_actions:
            for model_data in valid_results.values():
                token = model_data.get("tunnel_token", "")
                if token:
                    print(f"::add-mask::{token}")

        secret_json = json.dumps(valid_results)
        print("\nGitHub Secret (TUNNELS_JSON):")
        print(secret_json)

        # Try to add secret automatically if gh CLI is available
        if not no_auto_secret and _try_add_github_secret(secret_json):
            print("✓ Secret added to GitHub automatically")
        else:
            print("\nCopy above JSON to GitHub Secret: TUNNELS_JSON")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Setup Cloudflare tunnels for all models")
    parser.add_argument(
        "--domain",
        required=True,
        help="Domain name (e.g., neevs.io)",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        help="Specific models to setup (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without actually creating",
    )
    parser.add_argument(
        "--no-auto-secret",
        action="store_true",
        help="Skip automatic GitHub Secret creation (use if gh CLI not available)",
    )

    args = parser.parse_args()

    if args.dry_run:
        print("DRY RUN MODE - No changes will be made\n")
        print("Models to setup (tunnel target is localhost:8000 for inference, :8080 for chat):")
        models = args.models or list(MODEL_CONFIGS.keys())
        for model in models:
            if model in MODEL_CONFIGS:
                config = MODEL_CONFIGS[model]
                tunnel_port = get_tunnel_port(model)
                print(f"  {model}: {config['subdomain']}.{args.domain} -> localhost:{tunnel_port}")
        sys.exit(0)

    setup_all_tunnels(args.domain, args.models, args.no_auto_secret)
