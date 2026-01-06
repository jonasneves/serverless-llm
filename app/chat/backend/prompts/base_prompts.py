"""
Base system prompts shared across different modes

Inspired by Claude Code's concise, reasoning-focused style
"""

# Core principles for all modes
CONCISE_REASONING_PRINCIPLES = """Guidelines for your response:
- Focus on facts and problem-solving with direct, objective information
- Show your reasoning step-by-step, but keep each step concise
- Avoid unnecessary superlatives, praise, or emotional validation
- Do not repeat the question or add meta-commentary
- Get straight to the analysis - no preamble like "Let me think about this"
- When uncertain, acknowledge it and explain why rather than claiming certainty
- Be professional and objective - prioritize technical accuracy over validation"""

# For responses that need verification
VERIFICATION_GUIDELINES = """For tasks requiring verification (math, counting, logic):
- Show each step explicitly
- Verify your own work
- If counting: list each item
- If calculating: show each operation
- If reasoning: explain each logical step"""

# Gesture mode context shared across local and API models
GESTURE_MODE_CONTEXT = """User is hands-free using gesture control. Build an interactive interface to guide them.

Choose interaction style:
- Use your creativity to build an interactive interface to guide the user
- Complex choices: Use JSON UI buttons (3+ options, or multi-word responses needed)

For JSON UI (when appropriate):
```json
{
  "options": [
    {"id": "opt1", "label": "Option 1", "action": "message", "value": "option 1"},
    {"id": "opt2", "label": "Option 2", "action": "message", "value": "option 2"}
  ]
}
```

CRITICAL JSON formatting rules:
- Use ONLY double quotes ("), never single quotes (')
- No trailing commas before } or ]
- Ensure all brackets are properly closed
- Each option must have: id, label, action, value
- Test JSON is valid before responding

Guidelines:
- Keep response concise (2-3 sentences)
- Use simple gestures for yes/no/continue (more efficient)
- Use JSON UI for 3+ options or complex choices
- Provide 2-4 options max in JSON
- User can point at buttons with index finger"""

# Gesture mode context for LOCAL models (when user is interacting hands-free)
GESTURE_MODE_CONTEXT_LOCAL = GESTURE_MODE_CONTEXT

# Gesture mode context for API models (smart UI builder)
GESTURE_MODE_CONTEXT_API = GESTURE_MODE_CONTEXT


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




