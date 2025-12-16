# System Prompts - Claude Instructions

## Philosophy

All prompts follow Claude/Anthropic's style from Claude Code:
- Concise but complete reasoning
- Direct and objective - facts over validation
- No meta-commentary or preamble
- Professional objectivity - technical accuracy first
- Acknowledge uncertainty rather than fake confidence

## Structure

```
prompts/
├── base_prompts.py       # Shared principles and guidelines
├── council_prompts.py    # Council mode (3-stage: respond → rank → synthesize)
├── discussion_prompts.py # Roundtable mode (turn-based discussion)
├── version.py           # Version tracking and changelog
└── CLAUDE.md           # This file
```

## Prompt Design Principles

### Length Targets
- Stage 1 responses: 100-200 words
- Synthesis: 150-300 words
- Participant responses: 80-150 words
- Use word counts only (more precise than paragraph counts)

### Token Efficiency
- System prompts contain behavioral guidelines
- User prompts contain only context and question
- Avoid duplicating instructions between system and user prompts

### Domain Adaptation
- Math/logic tasks: Add verification guidelines, lower temperature
- Creative tasks: Standard guidelines, normal temperature
- Discussion: Adapt based on whether verification needed

## When to Update Prompts

### If Models Are Too Verbose
1. Add specific word count targets
2. Strengthen "no preamble" language
3. Add examples of concise vs verbose responses

### If Reasoning Is Incomplete
1. Add domain-specific verification steps
2. Clarify what "complete reasoning" means
3. Add "show your work" for specific domains

### If Models Repeat Questions/Add Meta-Commentary
1. Strengthen "no meta-commentary" instruction
2. Add "get straight to analysis" language
3. Provide counter-examples

## Testing Changes

After updating prompts:
1. Manually review token counts (aim for <250 tokens per system prompt)
2. Verify no conflicts between system and user prompts
3. Check that length targets are specified
4. Test with actual models in each mode
5. Monitor average response length

## Maintenance

- Document what changed and why in changelog (below)
- Test before deploying
- Monitor response quality metrics

## Current Focus

Our prompts are optimized for:
- Small models (Phi, Qwen, Gemma, Llama-3.3-70B)
- Concise, reasoning-focused responses
- Multi-model deliberation (council/roundtable modes)

Small models benefit from:
- Clear, direct instructions
- Specific length targets
- Examples of good responses
- Domain-specific guidelines

## Changelog

### v1.0.0 (2025-01-15)
**Initial implementation of Claude/Anthropic-style prompts**

Changes:
- Concise reasoning principles for all modes
- Council mode: 3-stage prompts (respond → rank → synthesize)
- Roundtable mode: Dynamic prompts based on role (lead vs participant)
- Domain adaptation for verification tasks (math, logic, counting)
- Response length targets: 100-200 words for stage 1, 150-300 for synthesis
- Cleaned user prompts to remove redundancy (40% token reduction)
- System prompts separated from user context

Rationale: Small models need clear, concise instructions. Based on Claude Code system prompts for professional objectivity and focused reasoning.
