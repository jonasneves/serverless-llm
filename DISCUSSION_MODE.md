# Discussion Mode

Multi-model collaborative discussions powered by GPT-5-nano orchestration.

## Overview

Discussion Mode enables the three models (Qwen, Phi, Llama) to collaborate on responses by "thinking out loud together." An orchestrator (GPT-5-nano) analyzes queries, evaluates contributions based on each model's benchmark-proven strengths, and synthesizes a final response.

### How It Works

```
User Query
    ↓
[GPT-5-nano Orchestrator]
    • Analyzes domains (math, coding, reasoning, etc.)
    • Assigns expertise scores to each model
    • Determines discussion lead and expected turns
    ↓
[Turn 1: Lead Model]
    • Responds based on domain match
    • Orchestrator evaluates contribution
    ↓
[Turn 2+: Supporting Models]
    • Build on previous responses
    • Add expertise from their strengths
    • Orchestrator evaluates each turn
    ↓
[Synthesis]
    • Orchestrator creates merge plan
    • Combines best parts from each model
    • Returns weighted final response
```

## Model Expertise Profiles

Based on public benchmarks:

### Qwen 2.5-7B - Technical Expert
- **Strengths**: Mathematics (95%), Coding (90%), Logical Reasoning (85%)
- **Benchmarks**: MMLU 74.2, HumanEval 84.8, MATH 75.5
- **Best For**: Math problems, code generation, algorithms, data analysis

### Phi-3 Mini - Reasoning Specialist
- **Strengths**: Reasoning (90%), Instruction Following (88%), Common Sense (82%)
- **Benchmarks**: BigBench-Hard 72.1, ARC-Challenge 84.9, IFEval 80.4
- **Best For**: Logic puzzles, step-by-step reasoning, decision making

### Llama 3.2-3B - Conversationalist
- **Strengths**: Conversation (85%), Summarization (80%), Creative Writing (75%)
- **Benchmarks**: NIH Multi-needle 84.7, HellaSwag 70.8
- **Best For**: Casual conversation, summarization, creative writing, brainstorming

## Architecture

### Components

**Backend** (`app/chat-interface/`)
```
orchestrator.py          # GPT-5-nano client with structured outputs
model_profiles.py        # Benchmark-based expertise definitions
discussion_engine.py     # Turn-based discussion orchestration
chat_server.py           # FastAPI endpoints (+ discussion endpoint)
```

**Frontend**
```
static/discussion.html   # Discussion mode UI
```

### API Endpoint

**POST** `/api/chat/discussion/stream`

**Request:**
```json
{
  "query": "Write a Python function to check if a number is prime",
  "max_tokens": 512,
  "temperature": 0.7
}
```

**Response:** Server-Sent Events stream

```javascript
// Event types:
data: {"event": "analysis_complete", "analysis": {...}}
data: {"event": "turn_start", "model_id": "qwen2.5-7b", "turn_number": 0}
data: {"event": "turn_chunk", "model_id": "qwen2.5-7b", "chunk": "def"}
data: {"event": "turn_complete", "turn": {...}, "evaluation": {...}}
data: {"event": "synthesis_complete", "synthesis": {...}}
data: {"event": "discussion_complete", "final_response": "..."}
```

## Configuration

### Required Secret

Add to **Settings > Secrets and variables > Actions**:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `GH_MODELS_TOKEN` | GitHub Personal Access Token with `user_models:read` permission | [Create Token](https://github.com/settings/personal-access-tokens/new) |

**Creating the Token:**
1. Go to https://github.com/settings/personal-access-tokens/new
2. Name: "Discussion Mode Orchestrator"
3. Expiration: Choose duration
4. Permissions: Select **user_models:read**
5. Click "Generate token"
6. Copy token and add to GitHub Secrets

### Environment Variables

The workflow automatically configures:
```bash
GH_MODELS_TOKEN=${{ secrets.GH_MODELS_TOKEN }}  # For GPT-5-nano API
QWEN_API_URL=${{ secrets.QWEN_API_URL }}        # Existing model endpoints
PHI_API_URL=${{ secrets.PHI_API_URL }}
LLAMA_API_URL=${{ secrets.LLAMA_API_URL }}
```

## Usage

### Via Web Interface

1. Navigate to `https://your-chat-domain.com/discussion`
2. Enter your question
3. Adjust parameters (optional):
   - **Max Tokens**: 128-2048 (default: 512)
   - **Temperature**: 0.0-1.0 (default: 0.7)
4. Click **Start Discussion**
5. Watch models discuss in real-time:
   - **Analysis**: Orchestrator breaks down the query
   - **Turns**: Each model contributes with evaluation badges
   - **Synthesis**: Final weighted response

### Via API

```python
import requests
import json

def stream_discussion(query):
    response = requests.post(
        'https://your-chat-domain.com/api/chat/discussion/stream',
        json={'query': query, 'max_tokens': 512, 'temperature': 0.7},
        stream=True
    )

    for line in response.iter_lines():
        if line.startswith(b'data: '):
            data = json.loads(line[6:])
            event_type = data.get('event')

            if event_type == 'turn_chunk':
                print(data['chunk'], end='', flush=True)
            elif event_type == 'discussion_complete':
                print('\n\nFinal Response:')
                print(data['final_response'])

stream_discussion("Explain the difference between Python lists and tuples")
```

## Example Discussion

**Query:** "Write a Python function to check if a number is prime, then explain the time complexity"

**Analysis (GPT-5-nano):**
```json
{
  "query_domains": ["coding", "mathematics", "explanation"],
  "domain_weights": {"coding": 0.6, "mathematics": 0.3, "explanation": 0.1},
  "model_expertise_scores": {
    "qwen2.5-7b": 0.92,
    "phi-3-mini": 0.75,
    "llama-3.2-3b": 0.58
  },
  "discussion_lead": "qwen2.5-7b",
  "expected_turns": 2
}
```

**Turn 1 - Qwen (Lead):**
```python
def is_prime(n):
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(n**0.5) + 1, 2):
        if n % i == 0:
            return False
    return True
```
*Evaluation: Quality 0.95, Relevance 0.98*

**Turn 2 - Phi (Supporting):**
"Building on Qwen's implementation, the time complexity is O(√n) because we only check divisors up to the square root. The space complexity is O(1)."
*Evaluation: Quality 0.88, Relevance 0.92*

**Turn 2 - Llama (Supporting):**
"To explain more clearly: imagine testing if 100 is prime. Instead of checking all numbers 2-99, we only check 2-10..."
*Evaluation: Quality 0.85, Relevance 0.90*

**Synthesis (GPT-5-nano):**
```json
{
  "primary_source_model": "qwen2.5-7b",
  "source_weights": {"qwen2.5-7b": 0.6, "phi-3-mini": 0.3, "llama-3.2-3b": 0.1},
  "merge_strategy": "combine_best"
}
```

**Final Response:** Combined output with code, complexity analysis, and intuitive explanation.

## Cost & Performance

### Orchestrator Costs (GPT-5-nano)
- **Calls per discussion**: 3-5 (analysis, per-turn evaluation, synthesis)
- **Tokens per call**: ~200-400 (structured outputs are concise)
- **Total per discussion**: ~1,000-2,000 orchestrator tokens

### Discussion Time
- **Simple queries** (1 turn): ~10-15 seconds
- **Moderate queries** (2 turns): ~20-30 seconds
- **Complex queries** (3-4 turns): ~40-60 seconds

### Rate Limits
GitHub Models API has rate limits. Check with:
```bash
curl -H "Authorization: Bearer $GH_MODELS_TOKEN" \
  https://models.github.ai/inference/chat/completions \
  -X POST -d '{"model":"gpt-5-nano","messages":[{"role":"user","content":"ping"}],"max_tokens":1}'
# Check x-ratelimit-* headers
```

## Local Development

```bash
# 1. Set environment variables
export GH_MODELS_TOKEN="ghp_your_token_here"
export QWEN_API_URL="http://localhost:8001"
export PHI_API_URL="http://localhost:8002"
export LLAMA_API_URL="http://localhost:8003"

# 2. Install dependencies
cd app/chat-interface
pip install -r requirements.txt

# 3. Start model servers (in separate terminals)
cd app/qwen-inference && python inference_server.py
cd app/phi-inference && python inference_server.py
cd app/llama-inference && python inference_server.py

# 4. Start chat interface
cd app/chat-interface
python chat_server.py

# 5. Access discussion mode
open http://localhost:8080/discussion
```

## Troubleshooting

### Error: "GH_MODELS_TOKEN not configured"
- Add `GH_MODELS_TOKEN` to GitHub Secrets
- For local dev, set `export GH_MODELS_TOKEN=...`

### Error: "Rate limit exceeded"
- GitHub Models API has rate limits
- Wait for reset time (check `x-ratelimit-reset` header)
- Consider reducing `expected_turns` in complex discussions

### Models not participating
- Check model endpoints are accessible
- Verify `QWEN_API_URL`, `PHI_API_URL`, `LLAMA_API_URL` are set
- Check model server health: `curl http://localhost:8001/health`

### Orchestrator returning invalid JSON
- GPT-5-nano occasionally may not follow schema perfectly
- The code handles this with retry logic and fallbacks
- Check logs for parse errors

### Discussion taking too long
- Reduce `max_tokens` (default: 512 → try 256)
- Queries with `expected_turns: 4` can take 60+ seconds
- Orchestrator tries to optimize turn count based on query complexity

## Roadmap

**Phase 1** (Current)
- [x] Basic orchestrator with GPT-5-nano
- [x] Turn-based discussion engine
- [x] Streaming SSE events
- [x] Discussion mode UI

**Phase 2** (Planned)
- [ ] Cache orchestrator analysis for similar queries
- [ ] Parallel model turns (where possible)
- [ ] User feedback on synthesis quality
- [ ] Discussion history/replay

**Phase 3** (Future)
- [ ] Custom orchestrator prompts
- [ ] Model vote on final response
- [ ] Disagreement highlighting
- [ ] Discussion templates for common query types

## Credits

- **Orchestrator**: GPT-5-nano via [GitHub Models](https://github.com/marketplace/models)
- **Models**: Qwen 2.5-7B (Alibaba), Phi-3 Mini (Microsoft), Llama 3.2-3B (Meta)
- **Inspiration**: [llm-council](https://github.com/example/llm-council) multi-agent deliberation pattern

## License

MIT License - Same as parent project
