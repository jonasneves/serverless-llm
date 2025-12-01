# Agents Mode

Multi-agent orchestration with tool calling for complex tasks.

## Overview

An orchestrator agent (Qwen 2.5-7B) analyzes queries and intelligently routes to specialized tools and models.

## Available Tools

| Tool | Description |
|------|-------------|
| **enhance_reasoning** | Routes to specialized reasoning models (Qwen/Phi/Llama) |
| **answer** | Generates final answers using best-fit model |
| **search** | Web search via DuckDuckGo API |
| **code_interpreter** | Executes Python code in sandboxed environment |

## How It Works

```
User Query
    ↓
[Orchestrator] Analyzes + chooses tools via function calling
    ↓
[Tools Execute] Search web / run code / call models
    ↓
[Orchestrator] Evaluates results + decides next step
    ↓
[Final Answer] Synthesized response
```

## Example Queries

**Math with reasoning:**
```
If a train travels 120 km in 2 hours, then increases speed by 20% for the next hour, how far does it travel total?
```

**Web search:**
```
What is the current population of Tokyo?
```

**Code execution:**
```
Generate the first 10 Fibonacci numbers and find their sum
```

**Multi-tool:**
```
Search for the latest Python version, then write code to check if it's installed
```

## Local Development

```bash
# Start model servers
cd app/qwen-inference && python inference_server.py  # Terminal 1
cd app/phi-inference && python inference_server.py   # Terminal 2
cd app/llama-inference && python inference_server.py # Terminal 3

# Set environment variables
export QWEN_API_URL="http://localhost:8001"
export PHI_API_URL="http://localhost:8002"
export LLAMA_API_URL="http://localhost:8003"

# Start chat interface
cd app/chat-interface && python chat_server.py

# Access at http://localhost:8080/autogen
```

## API Endpoint

**POST** `/api/chat/orchestrator/stream`

Request:
```json
{
  "query": "Your question",
  "max_rounds": 5,
  "temperature": 0.7,
  "max_tokens": 512
}
```

Response: Server-Sent Events stream with `tool_call`, `tool_result`, and `final_answer` events.

## Configuration

### Add Custom Tools

1. Define tool in `tools_config.json` (OpenAI function format)
2. Implement handler in `tools/` directory
3. Register in `orchestrator_engine.py` → `_execute_tool()`

### Modify Model Routing

Edit `MODEL_MAPPING` in `app/chat-interface/tools/model_router.py`:

```python
MODEL_MAPPING = {
    "reasoner-1": {
        "name": "Qwen 2.5-7B",
        "url_env": "QWEN_API_URL",
        "description": "Strong reasoning and coding"
    }
}
```

## vs. Discussion Mode

| Feature | Discussion | Agents |
|---------|------------|--------|
| **Approach** | All models collaborate | Smart routing to best tool/model |
| **Coordinator** | GPT-orchestrator | Qwen function calling |
| **Cost** | Higher (all models run) | Lower (only needed resources) |
| **Tools** | None | Search, code execution, etc. |

## Architecture

```
app/chat-interface/
├── orchestrator_engine.py    # Core orchestration logic
├── tools_config.json          # Tool definitions
├── tools/
│   ├── model_router.py        # Routes to Qwen/Phi/Llama
│   ├── web_search.py          # DuckDuckGo integration
│   └── code_executor.py       # Python sandbox
└── static/orchestrator.html   # Web UI
```

## Credits

Based on **ToolOrchestra** by NVIDIA Research ([arXiv:2511.21689](https://arxiv.org/abs/2511.21689))
