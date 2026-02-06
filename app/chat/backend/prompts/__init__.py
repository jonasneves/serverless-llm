"""
System prompts for different conversation modes
"""

from .base_prompts import (
    ANALYZE_RESPONSE_SYSTEM,
    DEBATE_TURN_SYSTEM,
)

from utils.text_processing import strip_thinking_tags

__all__ = [
    'ANALYZE_RESPONSE_SYSTEM',
    'DEBATE_TURN_SYSTEM',
    'strip_thinking_tags',
]
