"""
Utility functions for GitHub token handling
"""

from typing import Optional


def get_default_github_token() -> Optional[str]:
    """Return default GitHub Models token from environment.

    GitHub OAuth is now required - this always returns None.
    """
    return None
