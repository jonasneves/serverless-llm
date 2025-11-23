"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model endpoints configuration
MODEL_ENDPOINTS = {
    "qwen2.5-7b": os.getenv("QWEN_API_URL", "http://localhost:8001"),
    "phi-3-mini": os.getenv("PHI_API_URL", "http://localhost:8002"),
    "llama-3.2-3b": os.getenv("LLAMA_API_URL", "http://localhost:8003"),
}

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: int = 512
    temperature: float = 0.7

class ModelStatus(BaseModel):
    model: str
    status: str
    endpoint: str

# HTML Chat Interface
CHAT_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Chat Interface</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: #16213e;
            padding: 1rem;
            border-bottom: 1px solid #0f3460;
        }
        .header h1 {
            font-size: 1.5rem;
            color: #e94560;
        }
        .controls {
            display: flex;
            gap: 1rem;
            margin-top: 0.5rem;
            flex-wrap: wrap;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        select, input[type="range"] {
            background: #0f3460;
            border: 1px solid #e94560;
            color: #eee;
            padding: 0.5rem;
            border-radius: 4px;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .message {
            max-width: 80%;
            padding: 1rem;
            border-radius: 12px;
            line-height: 1.5;
        }
        .message.user {
            background: #0f3460;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }
        .message.assistant {
            background: #16213e;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            border: 1px solid #0f3460;
        }
        .message.error {
            background: #5c1a1a;
            align-self: center;
            border: 1px solid #e94560;
        }
        .message .model-tag {
            font-size: 0.75rem;
            color: #e94560;
            margin-bottom: 0.5rem;
        }
        .message pre {
            background: #0a0a14;
            padding: 0.5rem;
            border-radius: 4px;
            overflow-x: auto;
            margin: 0.5rem 0;
        }
        .message code {
            font-family: 'Fira Code', monospace;
            font-size: 0.9rem;
        }
        .input-container {
            padding: 1rem;
            background: #16213e;
            border-top: 1px solid #0f3460;
        }
        .input-wrapper {
            display: flex;
            gap: 0.5rem;
        }
        textarea {
            flex: 1;
            background: #0f3460;
            border: 1px solid #e94560;
            color: #eee;
            padding: 0.75rem;
            border-radius: 8px;
            resize: none;
            font-family: inherit;
            font-size: 1rem;
        }
        textarea:focus {
            outline: none;
            border-color: #ff6b6b;
        }
        button {
            background: #e94560;
            border: none;
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: background 0.2s;
        }
        button:hover {
            background: #ff6b6b;
        }
        button:disabled {
            background: #666;
            cursor: not-allowed;
        }
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 0.5rem;
        }
        .status-online { background: #4caf50; }
        .status-offline { background: #f44336; }
        .status-checking { background: #ff9800; }
        .typing-indicator {
            display: none;
            padding: 1rem;
            color: #888;
        }
        .typing-indicator.active {
            display: block;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .typing-dots span {
            animation: blink 1.4s infinite;
        }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    </style>
</head>
<body>
    <div class="header">
        <h1>LLM Chat Interface</h1>
        <div class="controls">
            <div class="control-group">
                <label for="model-select">Model:</label>
                <select id="model-select">
                    <option value="qwen2.5-7b">Qwen 2.5-7B</option>
                    <option value="phi-3-mini">Phi-3 Mini</option>
                    <option value="llama-3.2-3b">Llama 3.2-3B</option>
                </select>
                <span id="model-status" class="status-indicator status-checking"></span>
            </div>
            <div class="control-group">
                <label for="temp-slider">Temperature:</label>
                <input type="range" id="temp-slider" min="0" max="1" step="0.1" value="0.7">
                <span id="temp-value">0.7</span>
            </div>
            <div class="control-group">
                <label for="max-tokens">Max tokens:</label>
                <input type="number" id="max-tokens" value="512" min="1" max="4096" style="width: 80px;">
            </div>
            <button onclick="clearChat()" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Clear</button>
        </div>
    </div>

    <div class="chat-container" id="chat-container">
        <div class="message assistant">
            <div class="model-tag">System</div>
            Welcome! Select a model and start chatting. Make sure the inference servers are running.
        </div>
    </div>

    <div class="typing-indicator" id="typing-indicator">
        <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> Generating response...
    </div>

    <div class="input-container">
        <div class="input-wrapper">
            <textarea id="user-input" rows="2" placeholder="Type your message..."
                      onkeydown="handleKeyDown(event)"></textarea>
            <button onclick="sendMessage()" id="send-btn">Send</button>
        </div>
    </div>

    <script>
        const chatContainer = document.getElementById('chat-container');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const modelSelect = document.getElementById('model-select');
        const tempSlider = document.getElementById('temp-slider');
        const tempValue = document.getElementById('temp-value');
        const maxTokens = document.getElementById('max-tokens');
        const typingIndicator = document.getElementById('typing-indicator');
        const modelStatus = document.getElementById('model-status');

        let conversationHistory = [];

        tempSlider.addEventListener('input', () => {
            tempValue.textContent = tempSlider.value;
        });

        modelSelect.addEventListener('change', () => {
            checkModelStatus();
        });

        async function checkModelStatus() {
            modelStatus.className = 'status-indicator status-checking';
            try {
                const response = await fetch(`/api/models/${modelSelect.value}/status`);
                const data = await response.json();
                modelStatus.className = `status-indicator ${data.status === 'online' ? 'status-online' : 'status-offline'}`;
            } catch (error) {
                modelStatus.className = 'status-indicator status-offline';
            }
        }

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function addMessage(content, role, model = null) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${role}`;

            if (model && role === 'assistant') {
                const modelTag = document.createElement('div');
                modelTag.className = 'model-tag';
                modelTag.textContent = model;
                messageDiv.appendChild(modelTag);
            }

            // Simple markdown-like formatting
            let formatted = content
                .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');

            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = formatted;
            messageDiv.appendChild(contentDiv);

            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        async function sendMessage() {
            const message = userInput.value.trim();
            if (!message) return;

            // Add user message
            addMessage(message, 'user');
            conversationHistory.push({ role: 'user', content: message });
            userInput.value = '';

            // Disable input while generating
            sendBtn.disabled = true;
            userInput.disabled = true;
            typingIndicator.classList.add('active');

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelSelect.value,
                        messages: conversationHistory,
                        max_tokens: parseInt(maxTokens.value),
                        temperature: parseFloat(tempSlider.value)
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    const assistantMessage = data.choices[0].message.content;
                    conversationHistory.push({ role: 'assistant', content: assistantMessage });
                    addMessage(assistantMessage, 'assistant', modelSelect.options[modelSelect.selectedIndex].text);
                } else {
                    addMessage(`Error: ${data.detail || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                addMessage(`Connection error: ${error.message}`, 'error');
            } finally {
                sendBtn.disabled = false;
                userInput.disabled = false;
                typingIndicator.classList.remove('active');
                userInput.focus();
            }
        }

        function clearChat() {
            conversationHistory = [];
            chatContainer.innerHTML = '';
            addMessage('Chat cleared. Start a new conversation!', 'assistant');
        }

        // Initial status check
        checkModelStatus();
        setInterval(checkModelStatus, 30000);
    </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def chat_interface():
    return CHAT_HTML

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "chat-interface"}

@app.get("/api/models")
async def list_models():
    return {
        "models": list(MODEL_ENDPOINTS.keys()),
        "endpoints": MODEL_ENDPOINTS
    }

@app.get("/api/models/{model_id}/status")
async def model_status(model_id: str):
    if model_id not in MODEL_ENDPOINTS:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    endpoint = MODEL_ENDPOINTS[model_id]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{endpoint}/health")
            if response.status_code == 200:
                return ModelStatus(model=model_id, status="online", endpoint=endpoint)
    except Exception:
        pass

    return ModelStatus(model=model_id, status="offline", endpoint=endpoint)

@app.post("/api/chat")
async def chat(request: ChatRequest):
    if request.model not in MODEL_ENDPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {request.model}. Available: {list(MODEL_ENDPOINTS.keys())}"
        )

    endpoint = MODEL_ENDPOINTS[request.model]

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{endpoint}/v1/chat/completions",
                json={
                    "messages": [{"role": m.role, "content": m.content} for m in request.messages],
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature
                }
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Model API error: {response.text}"
                )

            return response.json()

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Model inference timeout")
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to {request.model} at {endpoint}"
        )

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
