"""
Base class for multi-model orchestration engines

Shared infrastructure for debate, analyze, and other multi-model modes.
"""

from typing import Dict
from clients.model_client import ModelClient


class MultiModelEngine:
    """Base class for multi-model orchestration engines"""

    def __init__(
        self,
        model_endpoints: Dict[str, str],
        github_token: str = None,
        openrouter_key: str = None,
        timeout: int = 60
    ):
        """
        Initialize multi-model engine

        Args:
            model_endpoints: Dict mapping model_id -> API URL for local models
            github_token: GitHub token for API models
            openrouter_key: OpenRouter API key
            timeout: Max seconds per response
        """
        self.model_endpoints = model_endpoints
        self.github_token = github_token
        self.openrouter_key = openrouter_key
        self.timeout = timeout
        self.client = ModelClient(github_token, openrouter_key)
