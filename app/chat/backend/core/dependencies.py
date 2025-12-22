"""
FastAPI dependencies for accessing application state.
"""

from typing import Dict
import asyncio

from core import state


def get_model_semaphores() -> Dict[str, asyncio.Semaphore]:
    """Dependency to access model semaphores."""
    return state.MODEL_SEMAPHORES


def get_model_capacities() -> Dict[str, int]:
    """Dependency to access model capacities."""
    return state.MODEL_CAPACITIES


def get_live_context_lengths() -> Dict[str, int]:
    """Dependency to access live context lengths."""
    return state.LIVE_CONTEXT_LENGTHS
