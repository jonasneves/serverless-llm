#!/usr/bin/env python3
"""
Creates a GitHub OAuth App for Serverless LLM Playground.

This OAuth App uses minimal permissions (read:user only).
The callback URL points to the oauth-proxy.
"""

import json
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
    """Run a command and return output."""
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"Command failed: {cmd}")
        print(result.stderr)
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
        print("  Warning: No change made to oauth.ts")
        return False
    OAUTH_TS_PATH.write_text(updated)
    return True


def update_railway_env(client_id, client_secret):
    """Update Railway environment variable for oauth-proxy."""
    # Check if railway CLI is available
    if not run_cmd("which railway", check=False):
        return False

    # Get current GITHUB_CLIENTS value
    current = run_cmd("railway variables --json", cwd=OAUTH_PROXY_DIR, check=False)
    if not current:
        return False

    try:
        vars_data = json.loads(current)
        current_clients = vars_data.get("GITHUB_CLIENTS", "{}")
        clients = json.loads(current_clients) if current_clients else {}
    except (json.JSONDecodeError, TypeError):
        clients = {}

    # Add new client
    clients[client_id] = client_secret
    new_value = json.dumps(clients)

    # Set the variable
    result = run_cmd(f"railway variables --set 'GITHUB_CLIENTS={new_value}'", cwd=OAUTH_PROXY_DIR, check=False)
    return result is not None


def build_frontend():
    """Run npm build for frontend."""
    frontend_dir = REPO_ROOT / "app/chat/frontend"
    print("  Running npm build...")
    result = subprocess.run(
        "npm run build",
        shell=True,
        cwd=frontend_dir,
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"  Build failed: {result.stderr}")
        return False
    return True


def main():
    print(f"Creating GitHub OAuth App: {APP_NAME}\n")

    print("Configuration:")
    print(f"  Name:         {APP_NAME}")
    print(f"  Homepage:     {HOMEPAGE}")
    print(f"  Callback URL: {CALLBACK_URL}")
    print(f"  Description:  {DESCRIPTION}")
    print()
    print("This app will only request 'read:user' scope (profile info only).")
    print()

    input("Press Enter to open browser...")

    # GitHub OAuth App creation URL (personal account)
    github_url = (
        f"https://github.com/settings/applications/new?"
        f"oauth_application[name]={quote(APP_NAME)}&"
        f"oauth_application[url]={quote(HOMEPAGE)}&"
        f"oauth_application[callback_url]={quote(CALLBACK_URL)}&"
        f"oauth_application[description]={quote(DESCRIPTION)}"
    )

    webbrowser.open(github_url)

    print("\n" + "=" * 60)
    print("After creating the OAuth App, enter the credentials below:")
    print("=" * 60 + "\n")

    client_id = input("Client ID: ").strip()
    if not client_id:
        print("Error: Client ID is required")
        sys.exit(1)

    client_secret = input("Client Secret: ").strip()
    if not client_secret:
        print("Error: Client Secret is required")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("Applying changes...")
    print("=" * 60 + "\n")

    # 1. Update oauth.ts
    print("[1/4] Updating oauth.ts...")
    if update_oauth_ts(client_id):
        print("  Done")
    else:
        print("  Failed - update manually")

    # 2. Try to update Railway env
    print("[2/4] Updating Railway env vars...")
    if update_railway_env(client_id, client_secret):
        print("  Done")
    else:
        print("  Skipped - update manually:")
        print(f'  Add to GITHUB_CLIENTS: {{"{client_id}":"{client_secret}"}}')

    # 3. Build frontend
    print("[3/4] Building frontend...")
    if build_frontend():
        print("  Done")
    else:
        print("  Failed - run manually: cd app/chat/frontend && npm run build")

    # 4. Show git status
    print("[4/4] Git status:")
    status = run_cmd("git status --short", cwd=REPO_ROOT, check=False)
    if status:
        print(status)
        print()
        commit = input("Commit changes? [y/N]: ").strip().lower()
        if commit == 'y':
            run_cmd("git add -A", cwd=REPO_ROOT)
            run_cmd("git commit -m 'Update GitHub OAuth client ID'", cwd=REPO_ROOT)
            print("  Committed")
    else:
        print("  No changes to commit")

    print("\nDone!")


if __name__ == "__main__":
    main()
