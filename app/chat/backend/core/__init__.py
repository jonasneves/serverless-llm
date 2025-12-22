"""
Core module for chat

Contains centralized configuration, state management, and base classes.
"""

from .config import MODEL_ENDPOINTS, MODEL_DISPLAY_NAMES, MODEL_CONFIG, DEFAULT_MODEL_ID
from .state import UNSUPPORTED_GITHUB_MODELS

__all__ = [
    "MODEL_ENDPOINTS",
    "MODEL_DISPLAY_NAMES", 
    "MODEL_CONFIG",
    "DEFAULT_MODEL_ID",
    "UNSUPPORTED_GITHUB_MODELS",
]
