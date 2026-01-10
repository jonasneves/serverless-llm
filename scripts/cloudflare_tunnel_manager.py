#!/usr/bin/env python3
"""
Cloudflare Tunnel Manager

Core API client for managing Cloudflare Tunnels.
Used by setup_tunnels.py for automated tunnel creation.
"""

import json
import requests
from typing import Dict, List, Optional, Tuple

# Cloudflare API endpoints
CF_API_BASE = "https://api.cloudflare.com/client/v4"
CF_ZERO_TRUST_API_BASE = "https://api.cloudflare.com/client/v4/accounts"


class CloudflareTunnelManager:
    """Manages Cloudflare Tunnels via API"""

    def __init__(self, api_token: str, account_id: str):
        """
        Initialize manager with Cloudflare credentials

        Args:
            api_token: Cloudflare API token with Zone:Read, Account:Cloudflare Tunnel:Edit permissions
            account_id: Cloudflare Account ID (found in Zero Trust dashboard URL)
        """
        self.api_token = api_token
        self.account_id = account_id
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    def _request(
        self, method: str, endpoint: str, data: Optional[Dict] = None
    ) -> Dict:
        """Make API request to Cloudflare"""
        url = f"{CF_ZERO_TRUST_API_BASE}/{self.account_id}/{endpoint}"
        response = requests.request(method, url, headers=self.headers, json=data)
        response.raise_for_status()
        result = response.json()

        if not result.get("success", False):
            errors = result.get("errors", [])
            raise Exception(f"Cloudflare API error: {errors}")

        return result

    def get_tunnels(self) -> List[Dict]:
        """List all tunnels in account"""
        result = self._request("GET", "cfd_tunnel")
        return result.get("result", [])

    def get_tunnel_by_name(self, name: str) -> Optional[Dict]:
        """Get tunnel by name"""
        tunnels = self.get_tunnels()
        return next((t for t in tunnels if t["name"] == name), None)

    def create_tunnel(self, name: str) -> Tuple[str, str]:
        """
        Create a new Cloudflare Tunnel

        Returns:
            Tuple of (tunnel_id, tunnel_token)
        """
        # Create tunnel
        data = {"name": name, "config_src": "local"}
        result = self._request("POST", "cfd_tunnel", data)
        tunnel = result["result"]
        tunnel_id = tunnel["id"]

        # Get tunnel token (this is what we need for cloudflared)
        token_result = self._request("GET", f"cfd_tunnel/{tunnel_id}/token")
        result_data = token_result.get("result", {})

        # Handle different response formats
        if isinstance(result_data, dict):
            tunnel_token = result_data.get("token", "")
        elif isinstance(result_data, str):
            # Token might be returned directly as string
            tunnel_token = result_data
        else:
            raise ValueError(f"Unexpected token result format: {type(result_data)}")

        if not tunnel_token:
            raise ValueError("Failed to retrieve tunnel token")

        return tunnel_id, tunnel_token

    def create_route(
        self,
        tunnel_id: str,
        subdomain: str,
        domain: str,
        service_url: str = "http://localhost:8000",
    ) -> Dict:
        """
        Create a public hostname route for a tunnel

        Args:
            tunnel_id: Tunnel ID
            subdomain: Subdomain (e.g., "qwen")
            domain: Domain (e.g., "neevs.io")
            service_url: Local service URL (e.g., "http://localhost:8000")
        """
        # Get current tunnel config
        try:
            config_result = self._request("GET", f"cfd_tunnel/{tunnel_id}/configurations")
            result_data = config_result.get("result")

            # Cloudflare API may return config in different formats
            if result_data is None:
                config = {}
            elif isinstance(result_data, str):
                # Config is a JSON string, parse it
                config = json.loads(result_data)
            elif isinstance(result_data, dict):
                # Config might be directly in result or nested under "config"
                config = result_data.get("config", result_data)
                # If config is still a string, parse it
                if isinstance(config, str):
                    config = json.loads(config)
                # If config is None, use empty dict
                if config is None:
                    config = {}
            else:
                # Fallback: empty config
                config = {}
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            # If we can't parse the config, start with empty config
            print(f"⚠️  Warning: Could not parse tunnel config, using empty config: {e}")
            config = {}

        # Ensure config is a dict before accessing (handle None case)
        if config is None:
            config = {}
        if not isinstance(config, dict):
            raise ValueError(f"Expected config to be a dict, got {type(config).__name__}: {config}")

        # Add new ingress rule
        ingress = config.get("ingress", [])

        # Ensure ingress is a list
        if not isinstance(ingress, list):
            ingress = []

        # Remove existing route for this hostname if it exists
        hostname = f"{subdomain}.{domain}"
        ingress = [r for r in ingress if r.get("hostname") != hostname]

        # Add new route at the beginning (before catch-all)
        new_route = {
            "hostname": hostname,
            "service": service_url,
        }
        ingress.insert(0, new_route)

        # Ensure catch-all is last
        ingress = [r for r in ingress if r.get("service") != "http_status:404"]
        ingress.append({"service": "http_status:404"})

        # Update tunnel config
        config["ingress"] = ingress
        data = {"config": config}

        result = self._request("PUT", f"cfd_tunnel/{tunnel_id}/configurations", data)
        return_result = result.get("result", {})
        return return_result if isinstance(return_result, dict) else {}

    def ensure_dns_record(
        self, zone_id: str, subdomain: str, domain: str, tunnel_id: str
    ) -> Dict:
        """
        Ensure DNS CNAME record exists for tunnel

        Args:
            zone_id: Cloudflare Zone ID for the domain
            subdomain: Subdomain (e.g., "qwen")
            domain: Domain (e.g., "neevs.io")
            tunnel_id: Tunnel ID
        """
        # DNS target for Cloudflare Tunnels is always {tunnel_id}.cfargotunnel.com
        dns_target = f"{tunnel_id}.cfargotunnel.com"

        # Check if DNS record exists
        records_url = f"{CF_API_BASE}/zones/{zone_id}/dns_records"
        record_name = f"{subdomain}.{domain}"
        params = {"name": record_name, "type": "CNAME"}
        response = requests.get(records_url, headers=self.headers, params=params)
        response.raise_for_status()
        result = response.json()

        if not result.get("success", False):
            errors = result.get("errors", [])
            raise Exception(f"Cloudflare API error getting DNS records: {errors}")

        records = result.get("result", [])

        if records:
            # Update existing record
            record = records[0]
            record_id = record["id"]
            existing_content = record.get("content", "").rstrip(".")  # Remove trailing dot if present
            dns_target_clean = dns_target.rstrip(".")

            # Only update if content is different or proxy is disabled
            existing_proxied = record.get("proxied", False)
            if existing_content != dns_target_clean or not existing_proxied:
                # Update record with proxied enabled (tunnels require proxy)
                data = {
                    "name": record_name,
                    "type": "CNAME",
                    "content": dns_target,
                    "ttl": 1,  # Auto
                    "proxied": True,  # Tunnels require Cloudflare proxy
                }

                try:
                    response = requests.put(
                        f"{records_url}/{record_id}", headers=self.headers, json=data
                    )
                    response.raise_for_status()
                    update_result = response.json()
                    if not update_result.get("success", False):
                        errors = update_result.get("errors", [])
                        error_msg = f"Cloudflare API error updating DNS record: {errors}"
                        # Include response body for debugging
                        try:
                            error_msg += f" (Response: {response.text})"
                        except:
                            pass
                        raise Exception(error_msg)
                    return update_result.get("result", {})
                except requests.exceptions.HTTPError as e:
                    # Try to get more details from the error
                    try:
                        error_body = e.response.json()
                        errors = error_body.get("errors", [])
                        raise Exception(f"Failed to update DNS record: {errors} (Status: {e.response.status_code})")
                    except:
                        raise Exception(f"Failed to update DNS record: {e} (Status: {e.response.status_code})")
            else:
                # Record already exists with correct content
                return record
        else:
            # Create new record with proxied enabled (matches tunnel connector behavior)
            data = {
                "name": record_name,
                "type": "CNAME",
                "content": dns_target,
                "ttl": 1,  # Auto
                "proxied": True,  # Enable Cloudflare proxy for tunnel
            }
            response = requests.post(records_url, headers=self.headers, json=data)
            response.raise_for_status()
            create_result = response.json()
            if not create_result.get("success", False):
                errors = create_result.get("errors", [])
                raise Exception(f"Cloudflare API error creating DNS record: {errors}")
            return create_result.get("result", {})

    def get_zone_id(self, domain: str) -> str:
        """Get Zone ID for a domain"""
        url = f"{CF_API_BASE}/zones"
        params = {"name": domain}
        response = requests.get(url, headers=self.headers, params=params)
        response.raise_for_status()
        zones = response.json().get("result", [])

        if not zones:
            raise Exception(f"Domain {domain} not found in Cloudflare account")

        return zones[0]["id"]
