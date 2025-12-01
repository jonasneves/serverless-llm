# Discussion Mode

Multi-model collaborative discussions orchestrated by GPT.

## Overview

Models (Qwen, Phi, Llama) collaborate by "thinking out loud together." A GPT orchestrator analyzes queries, evaluates contributions based on benchmark-proven expertise, and synthesizes the final response.

## How It Works

```
User Query
    ↓
[Orchestrator] Analyzes query + assigns expertise scores
    ↓
[Turn 1] Lead model responds
    ↓
[Turn 2+] Supporting models build on previous responses
    ↓
[Synthesis] Orchestrator combines best contributions
    ↓
[Final Response] Weighted merge from all models
```

## Model Expertise

Based on public benchmarks:

| Model | Strengths | Best For |
|-------|-----------|----------|
| **Qwen 2.5-7B** | Math (95%), Coding (90%), Logic (85%) | Math, code, algorithms, data analysis |
| **Phi-3 Mini** | Reasoning (90%), Instructions (88%), Common Sense (82%) | Logic puzzles, step-by-step reasoning |
| **Llama 3.2-3B** | Conversation (85%), Summarization (80%), Creative (75%) | Casual chat, summarization, brainstorming |

## Configuration

### Required Secret

Add `GH_MODELS_TOKEN` to GitHub Secrets:

1. Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/personal-access-tokens/new)
2. Set permission: `user_models:read`
3. Generate and copy token
4. Add to **Settings > Secrets and variables > Actions**

## Usage

### Web Interface

1. Navigate to `/discussion`
2. Enter question
3. Adjust parameters (optional):
   - **Max Tokens**: 128-2048 (default: 512)
   - **Temperature**: 0.0-1.0 (default: 0.7)
4. Watch real-time discussion with evaluations

### API Endpoint

**POST** `/api/chat/discussion/stream`

Request:
```json
{
  "query": "Write a Python function to check if a number is prime",
  "max_tokens": 512,
  "temperature": 0.7
}
```

Response: Server-Sent Events stream with `analysis_complete`, `turn_complete`, and `synthesis_complete` events.

## Example Queries

**Math problem:**
```
How many R's are in the word 'strawberry'?
```

**Logic puzzle:**
```
Which number is bigger: 9.11 or 9.9?
```

**Code request:**
```
Write a Python function to find the nth Fibonacci number
```

**Multi-step:**
```
I have 3 apples, eat 2, buy 5 more, give away 3. How many do I have?
```

## Architecture

```
app/chat-interface/
├── orchestrator.py          # GPT client with structured outputs
├── model_profiles.py        # Benchmark-based expertise
├── discussion_engine.py     # Turn-based orchestration
└── static/discussion.html   # Web UI
```

## Local Development

```bash
# Start model servers
cd app/qwen-inference && python inference_server.py  # Terminal 1
cd app/phi-inference && python inference_server.py   # Terminal 2
cd app/llama-inference && python inference_server.py # Terminal 3

# Set environment variables
export GH_MODELS_TOKEN="your_github_token"
export QWEN_API_URL="http://localhost:8001"
export PHI_API_URL="http://localhost:8002"
export LLAMA_API_URL="http://localhost:8003"

# Start chat interface
cd app/chat-interface && python chat_server.py

# Access at http://localhost:8080/discussion
```

## Benefits

- **Better Answers**: Combines strengths from multiple models
- **Transparency**: See how each model contributes
- **Expertise-Driven**: Orchestrator routes to best-fit models
- **Cost-Efficient**: Uses lightweight local models + small orchestrator calls
