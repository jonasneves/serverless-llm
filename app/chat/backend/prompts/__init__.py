"""
System prompts for different conversation modes

All prompts follow Claude/Anthropic's style:
- Concise but complete reasoning
- Direct and objective
- No unnecessary fluff or meta-commentary
"""

from .base_prompts import (
    CONCISE_REASONING_PRINCIPLES,
    VERIFICATION_GUIDELINES,
    GESTURE_MODE_CONTEXT_LOCAL,
    GESTURE_MODE_CONTEXT_API
)

from .analyze_prompts import (
    ANALYZE_RESPONSE_SYSTEM
)

from .debate_prompts import (
    DEBATE_TURN_SYSTEM
)

from .council_prompts import (
    COUNCIL_STAGE1_SYSTEM,
    COUNCIL_STAGE2_SYSTEM,
    COUNCIL_STAGE3_SYSTEM
)

from .discussion_prompts import (
    ROUNDTABLE_BASE_SYSTEM,
    ROUNDTABLE_SYNTHESIS_SYSTEM,
    get_roundtable_lead_system,
    get_roundtable_participant_system
)

from .personality_prompts import (
    PERSONALITY_GENERATION_SYSTEM,
    PERSONALITY_SIMPLE_SYSTEM,
    get_personality_response_system
)

__all__ = [
    # Base
    'CONCISE_REASONING_PRINCIPLES',
    'VERIFICATION_GUIDELINES',
    'GESTURE_MODE_CONTEXT_LOCAL',
    'GESTURE_MODE_CONTEXT_API',
    # Analyze
    'ANALYZE_RESPONSE_SYSTEM',
    # Debate
    'DEBATE_TURN_SYSTEM',
    # Council
    'COUNCIL_STAGE1_SYSTEM',
    'COUNCIL_STAGE2_SYSTEM',
    'COUNCIL_STAGE3_SYSTEM',
    # Roundtable/Discussion
    'ROUNDTABLE_BASE_SYSTEM',
    'ROUNDTABLE_SYNTHESIS_SYSTEM',
    'get_roundtable_lead_system',
    'get_roundtable_participant_system',
    # Personality
    'PERSONALITY_GENERATION_SYSTEM',
    'PERSONALITY_SIMPLE_SYSTEM',
    'get_personality_response_system',
]
