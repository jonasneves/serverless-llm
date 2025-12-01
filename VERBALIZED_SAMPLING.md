# Verbalized Sampling Mode

## Unlock LLM Diversity & Creativity

Verbalized Sampling is a training-free prompting technique from Stanford Research that mitigates mode collapse and unlocks LLM creative potential.

**Results:**
- 1.6-2x more creativity
- 25.7% higher diversity (human-rated)
- Beats fine-tuned models without retraining
- Restores 66.8% of lost creativity after alignment

**Paper:** [Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity](https://arxiv.org/abs/2411.16641)

## The Problem: Mode Collapse

### What is Mode Collapse?

Post-training alignment methods (RLHF, DPO) make LLMs helpful and safe, but they unintentionally cause **mode collapse** - the model gives the same predictable response every time.

### Why Does This Happen?

**Typicality Bias** in human preference data:
1. Annotators rate LLM responses
2. They naturally favor **familiar, predictable** answers
3. The reward model amplifies these typical responses
4. The LLM's probability distribution collapses to one dominant mode

### Example: Direct Prompting

```
Prompt: "Tell me a joke about coffee" (x5 times)

Response 1: Why did the coffee file a police report? Because it got mugged!
Response 2: Why did the coffee file a police report? Because it got mugged!
Response 3: Why did the coffee file a police report? Because it got mugged!
Response 4: Why did the coffee file a police report? Because it got mugged!
Response 5: Why did the coffee file a police report? Because it got mugged!
```

**Same joke every time = Mode Collapse**

## The Solution: Verbalized Sampling

### How It Works

Instead of asking for **one response**, ask for **a distribution of responses**.

This forces the model to:
1. Think about its **full knowledge space**
2. Tap into **diverse pre-trained distributions**
3. Generate **genuinely different** responses

### The Magic Prompt

**Direct Prompting:**
```
"Tell me a joke about coffee"
```

**Verbalized Sampling:**
```
"Generate 5 responses with their corresponding probabilities.

Tell me a joke about coffee."
```

### Example: Verbalized Sampling

```
Prompt: "Generate 5 responses with their corresponding probabilities. Tell me a joke about coffee"

Response 1 (Prob: 12%): Espresso may not solve all your problems, but it's a good shot!
Response 2 (Prob: 7%): Error 404: Coffee not found. Please restart human.
Response 3 (Prob: 15%): Why did the latte go to therapy? It had too much foam to deal with.
Response 4 (Prob: 7%): Cold brew is just coffee that took a gap year to find itself.
Response 5 (Prob: 6%): Coffee: because anger management is too expensive.
```

**5 genuinely different jokes = Diversity unlocked**

## Using the Diversity Mode

### Access

Once deployed: `https://chat.neevs.io/diversity`

### Interface

Side-by-side comparison showing:

**Left Side:** Direct Prompting (Mode Collapse)
- Same response repeated multiple times
- Low diversity

**Right Side:** Verbalized Sampling (Diverse Outputs)
- Multiple genuinely different responses
- Each with probability scores
- Diversity score calculated

### Controls

- **Query:** Your prompt (e.g., "Tell me a joke about coffee")
- **Model:** Choose Qwen 2.5-7B, Phi-3 Mini, or Llama 3.2-3B
- **Num Responses:** How many diverse responses (3-10, default: 5)
- **Temperature:** Higher = more diversity (0-2, default: 0.8)

### How to Use

1. Enter your prompt
2. Select model and parameters
3. Click "Compare Methods"
4. Watch both approaches run side-by-side:
   - **Direct Prompting:** Multiple calls with same prompt
   - **Verbalized Sampling:** Single call asking for distribution
5. Compare diversity scores!

## Why This Matters

### For Creative Tasks
- **Brainstorming:** Generate truly diverse ideas
- **Writing:** Get varied perspectives and styles
- **Problem-Solving:** Explore different approaches

### For Production Systems
- **A/B Testing:** More diverse test scenarios
- **Content Generation:** Avoid repetitive outputs
- **User Experience:** Keep responses fresh and interesting

### Zero Cost
- No retraining required
- No fine-tuning needed
- Just prompt engineering
- Works with any LLM

## Technical Details

### Implementation

The Verbalized Sampling Engine (`verbalized_sampling_engine.py`):

1. **Prompt Prefix:** Adds verbalized sampling instructions
2. **Streaming Generation:** Real-time response display
3. **Response Parsing:** Extracts individual responses and probabilities
4. **Diversity Scoring:** Calculates semantic diversity

### Diversity Score Calculation

Simple heuristic based on:
- **Length Variance:** Different response lengths
- **Word Uniqueness:** Unique words across responses
- **Jaccard Distance:** Semantic similarity between responses

Score range: 0.0 (identical) to 1.0 (completely different)

### API Endpoint

```
POST /api/verbalized-sampling/stream
```

Query parameters:
- `model`: Model to use (default: qwen2.5-7b)
- `num_responses`: Number of diverse responses (default: 5)
- `temperature`: Sampling temperature (default: 0.8)
- `max_tokens`: Max tokens per response (default: 1024)

Request body:
```json
{
  "query": "Your prompt here"
}
```

Stream events:
- `start`: Generation begins
- `chunk`: Streaming content
- `complete`: Finished with parsed responses and diversity score
- `error`: Error details

## Example Queries to Try

### Creative Writing
```
"Write an opening sentence for a sci-fi novel"
"Describe a sunset in different literary styles"
"Create metaphors for artificial intelligence"
```

### Brainstorming
```
"Suggest names for a coffee shop"
"List creative ways to reduce plastic waste"
"Generate startup ideas for education technology"
```

### Problem Solving
```
"How can I improve my morning routine?"
"What are ways to learn a new programming language?"
"Suggest approaches to debug a memory leak"
```

### Humor & Entertainment
```
"Tell me a joke about programming"
"Write a limerick about machine learning"
"Create puns using AI terms"
```

## Comparison: 4 Modes

Your serverless-llm platform now has 4 distinct modes:

| Mode | Purpose | Best For |
|------|---------|----------|
| **Arena** | Side-by-side model comparison | Choosing best model |
| **Discussion** | Multi-model debate | Complex reasoning |
| **AutoGen** | Multi-agent orchestration | Task delegation |
| **Diversity** | Unlock creative responses | Brainstorming, variety |

## Research Credit

This implementation is based on Stanford research:

**Paper:** "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity"
**arXiv:** https://arxiv.org/abs/2411.16641
**Authors:** Stanford NLP Group
**Published:** November 2024

Key findings:
- Boosts creativity 1.6-2x over direct prompting
- Raises human-rated diversity by 25.7%
- Beats specialized fine-tuned models without training
- Restores 66.8% of lost creativity after alignment
- Works across different LLM architectures

## Architecture

```
User Query → Verbalized Sampling Engine
    ↓
Prompt Transformation:
"Your query" 
    → 
"Generate N responses with probabilities. Your query"
    ↓
LLM Generation (streaming)
    ↓
Response Parsing:
├── Response 1 (Prob: X%)
├── Response 2 (Prob: Y%)
├── Response 3 (Prob: Z%)
...
    ↓
Diversity Score Calculation
    ↓
Display side-by-side with Direct Prompting
```

## Benefits Summary

- 1.6-2x more creative responses
- 25.7% higher diversity (human-rated)
- Zero training required - just prompting
- Works with any LLM - model-agnostic
- Production-ready - integrated into platform
- Side-by-side comparison - see the difference
- Real-time streaming - instant feedback
- Customizable - control response count and temperature  

## What's Next?

### Try It Out
1. Deploy the updated code
2. Go to `https://chat.neevs.io/diversity`
3. Try different prompts and see the diversity unlock

### Experiment With
- Different models (Qwen vs Phi vs Llama)
- Various temperatures (0.5 = focused, 1.5 = wild)
- Different num_responses (3-10)
- Creative vs analytical prompts

### Potential Enhancements
- Add semantic similarity analysis for diversity
- Save/export diverse response sets
- Compare diversity across different models
- Add Chain-of-Thought verbalized sampling
- Implement Multi-variant verbalized sampling

