# Cloudflare Tunnel Automation

Automated tunnel creation and management via Cloudflare API.

## Setup

1. Create Cloudflare API token with `Zone:Read` and `Account:Cloudflare Tunnel:Edit` permissions
2. Add to GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
3. Run: `python scripts/setup_tunnels.py --domain yourdomain.com`

## Usage

**Setup all tunnels:**
```bash
python scripts/setup_tunnels.py --domain neevs.io
```

**Setup specific models:**
```bash
python scripts/setup_tunnels.py --domain neevs.io --models qwen gemma
```

**Dry run (preview changes):**
```bash
python scripts/setup_tunnels.py --domain neevs.io --dry-run
```

The script outputs the `TUNNELS_JSON` secret value. Copy it to GitHub Secrets.

## Architecture

- `setup_tunnels.py` - Main entry point: creates tunnels, routes, DNS records, outputs secret
- `cloudflare_tunnel_manager.py` - Core API client (used by setup_tunnels.py)
- `get_tunnel_token.py` - Token retrieval utility for workflows
- Workflows read from `TUNNELS_JSON` secret (single secret for all models)

## Security

- `tunnels.json` is gitignored (contains tokens)
- Never commit tunnel tokens to version control
