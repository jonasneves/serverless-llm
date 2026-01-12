"""
Text processing utilities for model responses.
"""

import re


def strip_thinking_tags(content: str) -> str:
    """
    Strip thinking/analysis content from model responses.

    Handles:
    - <think>...</think> and <thinking>...</thinking> blocks (DeepSeek, SmolLM3, etc.)
    - Implicit thinking where content starts with thinking but has no opening tag
    - GPT-OSS Harmony format: <|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...
    """
    if not content:
        return ""

    # GPT-OSS Harmony format: extract only the "final" channel content
    # Pattern: <|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>actual response
    harmony_match = re.search(
        r'<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)',
        content,
        flags=re.IGNORECASE
    )
    if harmony_match:
        content = harmony_match.group(1).strip()
    else:
        # Also handle case where analysis channel exists but no final channel marker
        # Strip everything up to and including the final channel marker
        content = re.sub(
            r'^[\s\S]*?<\|start\|>assistant<\|channel\|>final<\|message\|>',
            '',
            content,
            flags=re.IGNORECASE
        )
        # Also strip analysis channel blocks entirely
        content = re.sub(
            r'<\|channel\|>analysis<\|message\|>[\s\S]*?<\|end\|>\s*',
            '',
            content,
            flags=re.IGNORECASE
        )

    # Handle <think>...</think> blocks
    content = re.sub(r'<think>[\s\S]*?</think>\s*', '', content, flags=re.IGNORECASE)
    # Handle <thinking>...</thinking> blocks
    content = re.sub(r'<thinking>[\s\S]*?</thinking>\s*', '', content, flags=re.IGNORECASE)

    # Handle implicit thinking: content ends with </think> or </thinking> but no opening tag
    content = re.sub(r'^[\s\S]*?</think>\s*', '', content, flags=re.IGNORECASE)
    content = re.sub(r'^[\s\S]*?</thinking>\s*', '', content, flags=re.IGNORECASE)

    return content.strip()
