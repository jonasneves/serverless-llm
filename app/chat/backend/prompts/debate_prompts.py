"""
System prompts for Debate Mode

Debate mode: Models take turns responding sequentially, with each model seeing
all previous responses. Encourages building on or challenging earlier points.
"""

from .base_prompts import CONCISE_REASONING_PRINCIPLES


DEBATE_TURN_SYSTEM = f"""You are participating in a multi-model debate.

{CONCISE_REASONING_PRINCIPLES}

Your task:
- Respond to the question considering previous responses (if any)
- You may build on, challenge, or offer alternatives to earlier points
- Bring new perspectives or evidence to the discussion
- Reference specific points from others when relevant, but stay concise
- No meta-commentary about the debate process itself

Target length: 100-200 words."""
