"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
import time
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="2.0.0"
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

MODEL_DISPLAY_NAMES = {
    "qwen2.5-7b": "Qwen 2.5-7B",
    "phi-3-mini": "Phi-3 Mini",
    "llama-3.2-3b": "Llama 3.2-3B",
}

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: int = 512
    temperature: float = 0.7

class MultiChatRequest(BaseModel):
    models: List[str]
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
  <title>LLM Arena</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #FAFAFA;
      --bg-tertiary: #F3F4F6;
      --text-primary: #111827;
      --text-secondary: #6B7280;
      --text-tertiary: #9CA3AF;
      --border-color: #E5E7EB;
      --accent-color: #1e3a5f;
      --accent-hover: #2c4f7c;
      --accent-text: #ffffff;
      --danger-color: #DC2626;
      --warning-color: #D97706;
      --success-color: #059669;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
    }

    [data-theme="dark"] {
      --bg-primary: #0a0e14;
      --bg-secondary: #12161e;
      --bg-tertiary: #1a1f2b;
      --text-primary: #e4e7eb;
      --text-secondary: #9ca3af;
      --text-tertiary: #6b7280;
      --border-color: #1f2937;
      --accent-color: #1e3a8a;
      --accent-hover: #1e40af;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.5);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: background-color 0.3s, color 0.3s;
    }

    header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
    }

    .logo-icon {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.2);
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .logo-title {
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.02em;
    }

    .logo-subtitle {
      font-size: 11px;
      opacity: 0.85;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .icon-btn {
      width: 36px;
      height: 36px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .icon-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-history {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .message {
      max-width: 90%;
      line-height: 1.6;
      font-size: 14px;
    }

    .message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 16px 16px 4px 16px;
      box-shadow: 0 2px 8px rgba(30, 58, 95, 0.2);
    }

    .message.assistant {
      align-self: flex-start;
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      padding: 16px;
      border-radius: 12px;
      box-shadow: var(--shadow-sm);
    }

    .model-responses {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      width: 100%;
    }

    .model-response {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      box-shadow: var(--shadow-sm);
    }

    .model-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }

    .model-name {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent-color);
    }

    .model-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .message-content {
      color: var(--text-primary);
      font-size: 14px;
      line-height: 1.6;
    }

    .message-content p { margin-bottom: 0.75em; }
    .message-content p:last-child { margin-bottom: 0; }
    .message-content code {
      font-family: var(--font-mono);
      background-color: var(--bg-tertiary);
      padding: 0.15em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
      border: 1px solid var(--border-color);
    }
    .message-content pre {
      background-color: var(--bg-secondary);
      padding: 0.75rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 0.75em 0;
      border: 1px solid var(--border-color);
    }
    .message-content pre code {
      background: transparent;
      padding: 0;
      border: none;
    }

    .message-footer {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color);
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      opacity: 0.7;
    }

    .stat-value {
      font-weight: 600;
      color: var(--text-primary);
    }

    .input-container {
      padding: 1rem;
      background-color: var(--bg-primary);
      border-top: 1px solid var(--border-color);
    }

    .controls-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .model-selector {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .model-chip {
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      color: var(--text-secondary);
      transition: all 0.15s ease;
    }

    .model-chip:hover {
      border-color: var(--accent-color);
      color: var(--accent-color);
    }

    .model-chip.selected {
      background: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }

    .model-chip .status-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .status-online { background: var(--success-color); }
    .status-offline { background: var(--danger-color); }
    .status-checking { background: var(--warning-color); }

    .control-group {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .control-group input, .control-group select {
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 12px;
    }

    .input-wrapper {
      position: relative;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      background-color: var(--bg-secondary);
      transition: border-color 0.2s, box-shadow 0.2s;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-sm);
    }

    .input-wrapper:focus-within {
      border-color: var(--accent-color);
      box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
    }

    textarea {
      width: 100%;
      background: transparent;
      border: none;
      color: var(--text-primary);
      padding: 12px 16px;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      resize: none;
      min-height: 60px;
      max-height: 150px;
      outline: none;
    }

    textarea::placeholder {
      color: var(--text-tertiary);
    }

    .input-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-top: 1px solid var(--border-color);
    }

    .send-btn {
      background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .send-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(30, 58, 95, 0.3);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .typing-indicator {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-radius: 12px;
      width: fit-content;
      margin: 0.5rem 1rem;
    }

    .typing-indicator.active {
      display: flex;
    }

    .dot {
      width: 8px;
      height: 8px;
      background: var(--accent-color);
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .dot:nth-child(1) { animation-delay: -0.32s; }
    .dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }

    .welcome-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 16px;
    }

    .welcome-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 8px;
    }

    .welcome-subtitle {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
    [data-theme="dark"] ::-webkit-scrollbar-thumb { background: #374151; }
    [data-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: #4b5563; }

    .clear-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }

    .clear-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <div class="logo-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      </div>
      <div class="logo-text">
        <span class="logo-title">LLM Arena</span>
        <span class="logo-subtitle">Compare AI Models</span>
      </div>
    </div>
    <div class="header-actions">
      <button id="themeToggle" class="icon-btn" title="Toggle Theme">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
        </svg>
      </button>
    </div>
  </header>

  <main>
    <div id="chatHistory" class="chat-history">
      <div class="welcome-card">
        <div class="welcome-title">Compare AI Model Responses</div>
        <div class="welcome-subtitle">
          Select one or multiple models to compare their responses side-by-side.
          Each response includes metrics like tokens and response time.
        </div>
      </div>
    </div>

    <div class="typing-indicator" id="typingIndicator">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
      <span style="font-size: 12px; color: var(--text-secondary); margin-left: 8px;">Generating...</span>
    </div>

    <div class="input-container">
      <div class="controls-row">
        <div class="model-selector" id="modelSelector">
          <!-- Model chips populated by JS -->
        </div>
        <div style="flex: 1;"></div>
        <div class="control-group">
          <label>Temp:</label>
          <input type="range" id="tempSlider" min="0" max="1" step="0.1" value="0.7" style="width: 80px;">
          <span id="tempValue">0.7</span>
        </div>
        <div class="control-group">
          <label>Tokens:</label>
          <input type="number" id="maxTokens" value="512" min="1" max="4096" style="width: 70px;">
        </div>
        <button class="clear-btn" onclick="clearChat()">Clear</button>
      </div>

      <div class="input-wrapper">
        <textarea id="userInput" placeholder="Ask a question to compare model responses..." rows="2"></textarea>
        <div class="input-footer">
          <span style="font-size: 11px; color: var(--text-tertiary);" id="selectedCount">0 models selected</span>
          <button id="sendBtn" class="send-btn" disabled>
            <span>Send</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </main>

  <script>
    const MODELS = {
      'qwen2.5-7b': { name: 'Qwen 2.5-7B', status: 'checking' },
      'phi-3-mini': { name: 'Phi-3 Mini', status: 'checking' },
      'llama-3.2-3b': { name: 'Llama 3.2-3B', status: 'checking' }
    };

    let selectedModels = new Set(['qwen2.5-7b']);
    let conversationHistory = [];

    const chatHistory = document.getElementById('chatHistory');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const modelSelector = document.getElementById('modelSelector');
    const tempSlider = document.getElementById('tempSlider');
    const tempValue = document.getElementById('tempValue');
    const maxTokens = document.getElementById('maxTokens');
    const typingIndicator = document.getElementById('typingIndicator');
    const selectedCount = document.getElementById('selectedCount');
    const themeToggle = document.getElementById('themeToggle');

    // Theme toggle
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    // Initialize model selector
    function renderModelSelector() {
      modelSelector.innerHTML = '';
      for (const [id, model] of Object.entries(MODELS)) {
        const chip = document.createElement('div');
        chip.className = `model-chip ${selectedModels.has(id) ? 'selected' : ''}`;
        chip.innerHTML = `<span class="status-dot status-${model.status}"></span>${model.name}`;
        chip.onclick = () => toggleModel(id);
        modelSelector.appendChild(chip);
      }
      updateSelectedCount();
    }

    function toggleModel(id) {
      if (selectedModels.has(id)) {
        selectedModels.delete(id);
      } else {
        selectedModels.add(id);
      }
      renderModelSelector();
    }

    function updateSelectedCount() {
      const count = selectedModels.size;
      selectedCount.textContent = `${count} model${count !== 1 ? 's' : ''} selected`;
      sendBtn.disabled = count === 0;
    }

    // Temperature slider
    tempSlider.addEventListener('input', () => {
      tempValue.textContent = tempSlider.value;
    });

    // Check model status
    async function checkModelStatus(modelId) {
      try {
        const response = await fetch(`/api/models/${modelId}/status`);
        const data = await response.json();
        MODELS[modelId].status = data.status === 'online' ? 'online' : 'offline';
      } catch {
        MODELS[modelId].status = 'offline';
      }
      renderModelSelector();
    }

    // Check all models
    function checkAllModels() {
      for (const id of Object.keys(MODELS)) {
        checkModelStatus(id);
      }
    }

    // Handle Enter key
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Add user message
    function addUserMessage(content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message user';
      messageDiv.textContent = content;
      chatHistory.appendChild(messageDiv);
      chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    // Add model responses
    function addModelResponses(responses) {
      if (responses.length === 1) {
        // Single model response
        const resp = responses[0];
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${resp.model}</span>
            ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
          </div>
          <div class="message-content">${formatContent(resp.content)}</div>
          ${!resp.error ? `
          <div class="message-footer">
            <div class="stat-item">
              <span class="stat-label">Tokens</span>
              <span class="stat-value">${resp.usage?.total_tokens || '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Tokens/s</span>
              <span class="stat-value">${resp.time && resp.usage ? (resp.usage.completion_tokens / resp.time).toFixed(1) : '-'}</span>
            </div>
          </div>
          ` : ''}
        `;
        chatHistory.appendChild(messageDiv);
      } else {
        // Multiple model responses
        const container = document.createElement('div');
        container.className = 'model-responses';

        for (const resp of responses) {
          const responseDiv = document.createElement('div');
          responseDiv.className = 'model-response';
          responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${resp.model}</span>
              ${resp.error ? '<span class="model-badge" style="background: #fecaca; color: #dc2626;">Error</span>' : ''}
            </div>
            <div class="message-content">${formatContent(resp.content)}</div>
            ${!resp.error ? `
            <div class="message-footer">
              <div class="stat-item">
                <span class="stat-label">Tokens</span>
                <span class="stat-value">${resp.usage?.total_tokens || '-'}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value">${resp.time ? resp.time.toFixed(2) + 's' : '-'}</span>
              </div>
            </div>
            ` : ''}
          `;
          container.appendChild(responseDiv);
        }

        chatHistory.appendChild(container);
      }

      chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function formatContent(content) {
      return content
        .replace(/```([\\s\\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\\n/g, '<br>');
    }

    async function sendMessage() {
      const message = userInput.value.trim();
      if (!message || selectedModels.size === 0) return;

      addUserMessage(message);
      conversationHistory.push({ role: 'user', content: message });
      userInput.value = '';

      sendBtn.disabled = true;
      userInput.disabled = true;
      typingIndicator.classList.add('active');

      try {
        const models = Array.from(selectedModels);
        const response = await fetch('/api/chat/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            models: models,
            messages: conversationHistory,
            max_tokens: parseInt(maxTokens.value),
            temperature: parseFloat(tempSlider.value)
          })
        });

        const data = await response.json();
        addModelResponses(data.responses);

        // Add first successful response to history
        const firstSuccess = data.responses.find(r => !r.error);
        if (firstSuccess) {
          conversationHistory.push({ role: 'assistant', content: firstSuccess.content });
        }
      } catch (error) {
        addModelResponses([{
          model: 'System',
          content: `Connection error: ${error.message}`,
          error: true
        }]);
      } finally {
        sendBtn.disabled = selectedModels.size === 0;
        userInput.disabled = false;
        typingIndicator.classList.remove('active');
        userInput.focus();
      }
    }

    function clearChat() {
      conversationHistory = [];
      chatHistory.innerHTML = `
        <div class="welcome-card">
          <div class="welcome-title">Compare AI Model Responses</div>
          <div class="welcome-subtitle">
            Select one or multiple models to compare their responses side-by-side.
            Each response includes metrics like tokens and response time.
          </div>
        </div>
      `;
    }

    // Initialize
    renderModelSelector();
    checkAllModels();
    setInterval(checkAllModels, 30000);
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

async def query_model(client: httpx.AsyncClient, model_id: str, messages: list, max_tokens: int, temperature: float):
    """Query a single model and return results with timing"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    start_time = time.time()
    try:
        response = await client.post(
            f"{endpoint}/v1/chat/completions",
            json={
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
        )
        elapsed = time.time() - start_time

        if response.status_code != 200:
            return {
                "model": display_name,
                "content": f"Error: {response.text}",
                "error": True,
                "time": elapsed
            }

        data = response.json()
        return {
            "model": display_name,
            "content": data["choices"][0]["message"]["content"],
            "usage": data.get("usage", {}),
            "time": elapsed,
            "error": False
        }

    except httpx.TimeoutException:
        return {
            "model": display_name,
            "content": "Request timeout",
            "error": True,
            "time": time.time() - start_time
        }
    except httpx.ConnectError:
        return {
            "model": display_name,
            "content": f"Cannot connect to {endpoint}",
            "error": True,
            "time": time.time() - start_time
        }
    except Exception as e:
        return {
            "model": display_name,
            "content": str(e),
            "error": True,
            "time": time.time() - start_time
        }

@app.post("/api/chat/multi")
async def chat_multi(request: MultiChatRequest):
    """Query multiple models in parallel"""
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async with httpx.AsyncClient(timeout=120.0) as client:
        tasks = [
            query_model(client, model_id, messages, request.max_tokens, request.temperature)
            for model_id in request.models
            if model_id in MODEL_ENDPOINTS
        ]

        responses = await asyncio.gather(*tasks)

    return {"responses": responses}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
