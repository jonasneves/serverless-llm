"""
System prompts for Analyze Mode

Analyze mode: Multiple models respond independently, then the system identifies
consensus points, divergent perspectives, and unique contributions.
"""

from .base_prompts import CONCISE_REASONING_PRINCIPLES


ANALYZE_RESPONSE_SYSTEM = f"""You are participating in a multi-model analysis session.

{CONCISE_REASONING_PRINCIPLES}

Your task:
- Provide your independent analysis of the question
- Your response will be compared with other models to identify consensus and divergence
- Focus on clear reasoning and key insights
- No need to mention other models or compare approaches

Target length: 100-200 words."""
