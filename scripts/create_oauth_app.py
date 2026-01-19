#!/usr/bin/env python3
"""
Creates a GitHub OAuth App for Serverless LLM Playground.

This OAuth App uses minimal permissions (read:user only).
The callback URL points to the oauth-proxy.
"""

import re
import signal
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote

def handle_sigint(_sig, _frame):
    print("\n\nCancelled.")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_sigint)

APP_NAME = "Serverless LLM Playground"
CALLBACK_URL = "https://oauth.neevs.io/callback"
HOMEPAGE = "https://chat.neevs.io"
DESCRIPTION = "OAuth for Serverless LLM Playground - minimal permissions (read:user only)"

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
OAUTH_TS_PATH = REPO_ROOT / "app/chat/frontend/src/utils/oauth.ts"
OAUTH_PROXY_DIR = Path.home() / "Documents/GitHub/agentivo/oauth-proxy"


def run_cmd(cmd, cwd=None, check=True):
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        return None
    return result.stdout.strip()


def update_oauth_ts(client_id):
    """Update the client ID in oauth.ts."""
    content = OAUTH_TS_PATH.read_text()
    updated = re.sub(
        r"const GITHUB_CLIENT_ID = '[^']*'",
        f"const GITHUB_CLIENT_ID = '{client_id}'",
        content
    )
    if updated == content:
        return False
    OAUTH_TS_PATH.write_text(updated)
    return True


def build_frontend():
    """Run npm build for frontend."""
    frontend_dir = REPO_ROOT / "app/chat/frontend"
    result = subprocess.run(
        "npm run build",
        shell=True,
        cwd=frontend_dir,
        capture_output=True,
        text=True
    )
    return result.returncode == 0


def main():
    print(f"Creating GitHub OAuth App: {APP_NAME}\n")

    print("Configuration:")
    print(f"  Name:         {APP_NAME}")
    print(f"  Homepage:     {HOMEPAGE}")
    print(f"  Callback URL: {CALLBACK_URL}")
    print()

    input("Press Enter to open browser...")

    github_url = (
        f"https://github.com/settings/applications/new?"
        f"oauth_application[name]={quote(APP_NAME)}&"
        f"oauth_application[url]={quote(HOMEPAGE)}&"
        f"oauth_application[callback_url]={quote(CALLBACK_URL)}&"
        f"oauth_application[description]={quote(DESCRIPTION)}"
    )

    webbrowser.open(github_url)

    print("\n" + "=" * 60)
    print("After creating the OAuth App, enter the credentials:")
    print("=" * 60 + "\n")

    client_id = input("Client ID: ").strip()
    if not client_id:
        print("Error: Client ID required")
        sys.exit(1)

    client_secret = input("Client Secret: ").strip()
    if not client_secret:
        print("Error: Client Secret required")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("Applying changes...")
    print("=" * 60 + "\n")

    # 1. Update oauth.ts
    print("[1/3] Updating oauth.ts...")
    if update_oauth_ts(client_id):
        print("  Updated")
    else:
        print("  Already has this client ID")

    # 2. Build frontend
    print("[2/3] Building frontend...")
    if build_frontend():
        print("  Done")
    else:
        print("  Failed - run: cd app/chat/frontend && npm run build")

    # 3. Instructions for oauth-proxy
    print("[3/3] Add client to oauth-proxy:")
    print(f"  cd {OAUTH_PROXY_DIR}")
    print("  python3 scripts/manage_clients.py")
    print()
    print("  When prompted:")
    print(f"    App name: {APP_NAME}")
    print(f"    Client ID: {client_id}")
    print(f"    Client Secret: {client_secret}")

    print("\nDone!")


if __name__ == "__main__":
    main()
