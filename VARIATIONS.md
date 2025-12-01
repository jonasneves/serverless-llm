# Variations Mode

Explore output diversity through verbalized sampling.

## Overview

Compare direct prompting (mode collapse) vs. verbalized sampling (diverse outputs) to unlock LLM creative potential.

**Results from Stanford Research:**
- 1.6-2x more creativity
- 25.7% higher diversity
- No training required

[Paper: arXiv:2411.16641](https://arxiv.org/abs/2411.16641)

## The Problem: Mode Collapse

Post-training alignment (RLHF/DPO) causes LLMs to give the same predictable response every time due to **typicality bias** in human preference data.

**Example:**
```
Prompt: "Tell me a joke about coffee" (5x)

Direct Prompting:
Response 1-5: Why did the coffee file a police report? Because it got mugged!
(Same joke every time)
```

## The Solution: Verbalized Sampling

Ask for a **distribution of responses** instead of one response.

**Direct Prompting:**
```
"Tell me a joke about coffee"
```

**Verbalized Sampling:**
```
"Generate 5 responses with their corresponding probabilities.

Tell me a joke about coffee."
```

**Result:**
```
Response 1 (12%): Espresso may not solve all your problems, but it's a good shot!
Response 2 (7%):  Error 404: Coffee not found. Please restart human.
Response 3 (15%): Why did the latte go to therapy? It had too much foam.
Response 4 (7%):  Cold brew is just coffee that took a gap year.
Response 5 (6%):  Coffee: because anger management is too expensive.
```

## Interface

Side-by-side comparison:

- **Left:** Direct Prompting (repeated identical responses)
- **Right:** Verbalized Sampling (diverse outputs with probabilities)
- **Diversity Score:** Calculated from semantic variance

## Controls

| Parameter | Description | Default |
|-----------|-------------|---------|
| Query | Your prompt | - |
| Model | Qwen / Phi / Llama | Qwen 2.5-7B |
| Num Responses | Response count | 5 (3-10) |
| Temperature | Randomness | 0.8 (0-2) |

## Example Queries

**Creative writing:**
```
Write an opening line for a sci-fi novel
Create metaphors for artificial intelligence
```

**Brainstorming:**
```
Suggest names for a coffee shop
Generate startup ideas for education technology
```

**Problem solving:**
```
How can I improve my morning routine?
Suggest approaches to debug a memory leak
```

## API Endpoint

**POST** `/api/verbalized-sampling/stream`

Request:
```json
{
  "query": "Your prompt",
  "model": "qwen2.5-7b",
  "num_responses": 5,
  "temperature": 0.8,
  "max_tokens": 1024
}
```

Response: Server-Sent Events stream with parsed responses and diversity score.

## How It Works

```
User Query
    ↓
Prompt Transformation:
"Generate N responses with probabilities. [Query]"
    ↓
LLM Generation (streaming)
    ↓
Parse Responses + Calculate Diversity
    ↓
Display Side-by-Side with Direct Prompting
```

## Use Cases

- **Brainstorming:** Generate truly diverse ideas
- **Creative Writing:** Explore varied styles and perspectives
- **A/B Testing:** Create diverse test scenarios
- **Content Generation:** Avoid repetitive outputs

## Credits

Based on Stanford NLP research: **Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity** ([arXiv:2411.16641](https://arxiv.org/abs/2411.16641))
