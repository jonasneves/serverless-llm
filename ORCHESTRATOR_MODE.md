# ToolOrchestra Mode - Implementation Guide

**Status:** ✅ Fully Implemented

ToolOrchestra-style intelligent orchestration has been successfully integrated into your serverless-llm project!

## What Was Built

### 1. Core Architecture (/app/chat-interface/)

```
app/chat-interface/
├── orchestrator_engine.py      # Multi-turn orchestration engine
├── tools_config.json            # Tool definitions (OpenAI function format)
├── tools/
│   ├── __init__.py
│   ├── model_router.py          # Routes to Qwen/Phi/Llama
│   ├── web_search.py            # DuckDuckGo web search
│   └── code_executor.py         # Python code execution
└── static/
    └── orchestrator.html        # Web UI
```

### 2. Available Tools

| Tool | Description | Models/Services |
|------|-------------|-----------------|
| **enhance_reasoning** | Call specialized reasoning models | reasoner-1 (Qwen), reasoner-2 (Phi), reasoner-3 (Llama) |
| **answer** | Generate final answer | answer-1 (Qwen), answer-2 (Phi), answer-3 (Llama) |
| **search** | Web search for information | DuckDuckGo API (free, no key needed) |
| **code_interpreter** | Execute Python code | Sandboxed subprocess execution |

### 3. How It Works

```
User Query
    ↓
[Qwen 2.5-7B Orchestrator]  ← Uses function calling to decide
    ↓
Chooses Tool: "enhance_reasoning" with model="reasoner-1"
    ↓
[Execute Tool] → Call Qwen API → Return result
    ↓
[Orchestrator] → Evaluates result, chooses next tool
    ↓
Chooses Tool: "search" to get more info
    ↓
[Execute Tool] → DuckDuckGo search → Return results
    ↓
[Orchestrator] → Has enough info, calls "answer"
    ↓
Chooses Tool: "answer" with model="answer-1"
    ↓
[Final Answer] → Synthesized response
```

## How to Test Locally

### 1. Start Your Model Servers

You need your existing model servers running:

```bash
# Terminal 1: Qwen (orchestrator + model)
cd app/qwen-inference
python inference_server.py

# Terminal 2: Phi
cd app/phi-inference
python inference_server.py

# Terminal 3: Llama
cd app/llama-inference
python inference_server.py
```

### 2. Set Environment Variables

```bash
export QWEN_API_URL="http://localhost:8001"
export PHI_API_URL="http://localhost:8002"
export LLAMA_API_URL="http://localhost:8003"
```

### 3. Start Chat Interface

```bash
cd app/chat-interface
python chat_server.py
```

### 4. Access Orchestrator Mode

Open in browser:
```
http://localhost:8080/orchestrator
```

## Test Queries to Try

### 1. **Math Problem with Reasoning**
```
Question: "If a train travels 120 km in 2 hours, then increases speed by 20% for the next hour, how far does it travel total?"
```
**Expected:** Orchestrator calls `enhance_reasoning` (Qwen) → then `answer` (Qwen)

### 2. **Question Requiring Web Search**
```
Question: "What is the current population of Tokyo?"
```
**Expected:** Orchestrator calls `search` (DuckDuckGo) → then `answer` with results

### 3. **Code Execution Task**
```
Question: "Generate the first 10 Fibonacci numbers and find their sum"
```
**Expected:** Orchestrator calls `code_interpreter` → executes Python → then `answer`

### 4. **Complex Multi-Tool Task**
```
Question: "Search for the latest Python version, then write code to check if it's installed on my system"
```
**Expected:** `search` → `code_interpreter` → `answer`

## API Endpoint

**POST** `/api/chat/orchestrator/stream`

### Request:
```json
{
  "query": "Your question here",
  "max_rounds": 5,
  "temperature": 0.7,
  "max_tokens": 512
}
```

### Response (Server-Sent Events):
```javascript
data: {"event": "start", "query": "...", "max_rounds": 5}
data: {"event": "round_start", "round": 1}
data: {"event": "tool_call", "tool": "enhance_reasoning", "arguments": {...}}
data: {"event": "tool_result", "tool": "enhance_reasoning", "result": {...}}
data: {"event": "final_answer", "content": "..."}
data: {"event": "complete", "summary": {...}}
```

## Configuration

### Modify Tool Mappings

Edit `app/chat-interface/tools/model_router.py`:

```python
MODEL_MAPPING = {
    "reasoner-1": {
        "name": "Qwen 2.5-7B",
        "url_env": "QWEN_API_URL",  # Change this
        "description": "Strong reasoning and coding"
    },
    # Add more models...
}
```

### Add New Tools

1. Add tool definition to `tools_config.json`
2. Implement tool in `tools/` directory
3. Register in `orchestrator_engine.py` → `_execute_tool()` method

Example:
```python
elif tool_name == "calculator":
    return await self.calculator.calculate(
        expression=arguments.get("expression")
    )
```

## Deployment to GitHub Actions

### Option 1: Add to Existing Chat Interface Workflow

Edit `.github/workflows/chat-interface.yml`:

```yaml
# No changes needed! Orchestrator mode is already part of chat_server.py
```

Just redeploy the chat interface and orchestrator mode will be available at:
```
https://your-domain.com/orchestrator
```

### Option 2: Test Everything Works

```bash
# Make sure all imports work
cd app/chat-interface
python -c "from orchestrator_engine import OrchestratorEngine; print('✓ Imports OK')"

# Check tools config is valid JSON
python -c "import json; json.load(open('tools_config.json')); print('✓ Tools config valid')"
```

## What's Next?

### Immediate Next Steps

1. **Test locally** with your model servers
2. **Try different queries** to see orchestration in action
3. **Deploy to GitHub Actions** (already integrated!)

### Future Enhancements

1. **Add Tavily API** for better web search ($10/mo):
   ```python
   # In tools/web_search.py
   TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
   ```

2. **Download Orchestrator-8B** when GGUF is available:
   - Replace Qwen as orchestrator
   - Potentially better routing decisions

3. **Add More Tools**:
   - Database query tool
   - Image generation
   - File operations
   - Custom domain tools

4. **Track Metrics**:
   - Cost per query
   - Tool usage statistics
   - Response quality

5. **User Preferences**:
   - Let users specify preferred models
   - Customize max rounds
   - Tool whitelist/blacklist

## Comparison with Discussion Mode

| Feature | Discussion Mode | Orchestrator Mode |
|---------|----------------|-------------------|
| **Approach** | All models discuss together | Smart routing to best model/tool |
| **Coordinator** | GPT-5-nano evaluates | Qwen function calling |
| **Goal** | Better answers via collaboration | Efficient task completion |
| **Cost** | Higher (all models run) | Lower (only needed models) |
| **Speed** | Slower (sequential) | Faster (targeted) |
| **Tools** | None | Web search, code exec, etc. |

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│         User Query                      │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│  Orchestrator (Qwen 2.5-7B)             │
│  - Analyzes query                       │
│  - Chooses tools via function calling   │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ↓                 ↓
┌─────────────┐    ┌─────────────┐
│    Tools    │    │   Models    │
├─────────────┤    ├─────────────┤
│ • Search    │    │ • Qwen 7B   │
│ • Code Exec │    │ • Phi 3.8B  │
│ • Reasoning │    │ • Llama 3B  │
└─────────────┘    └─────────────┘
        │                 │
        └────────┬────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│         Final Answer                    │
└─────────────────────────────────────────┘
```

## Troubleshooting

### "Model not configured"
- Check environment variables are set
- Verify model servers are running
- Check `MODEL_MAPPING` in `model_router.py`

### "Orchestrator API error"
- Ensure Qwen server supports function calling
- Check Qwen API URL is correct
- Verify tools_config.json is valid

### "Search failed"
- DuckDuckGo API may be rate-limited
- Add retry logic or use Tavily

### "Code execution error"
- Check Python is available in PATH
- Verify code doesn't use restricted operations
- Check timeout settings

## Credits

- **ToolOrchestra**: NVIDIA Research ([Paper](https://arxiv.org/abs/2511.21689), [Code](https://github.com/NVlabs/ToolOrchestra))
- **Implementation**: Adapted for serverless-llm with Qwen/Phi/Llama
- **Your Contribution**: Experimentation platform for model orchestration!

---

**🎉 Orchestrator Mode is ready to use!** Start your model servers and try it out at `http://localhost:8080/orchestrator`
