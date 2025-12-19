"""
Utility functions for GitHub token handling
"""

import os
from typing import Optional


def get_default_github_token() -> Optional[str]:
    """Return default GitHub Models token from environment."""
    return (
        os.getenv("GH_MODELS_TOKEN")
        or os.getenv("GITHUB_TOKEN")
        or os.getenv("GH_TOKEN")
    )
