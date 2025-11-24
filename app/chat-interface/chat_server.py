"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
import re
import time
import asyncio
import json
import logging
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import uvicorn

# Discussion mode imports
from orchestrator import GitHubModelsOrchestrator
from discussion_engine import DiscussionEngine
from model_profiles import MODEL_PROFILES

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sanitize_error_message(error_text: str, endpoint: str = "") -> str:
    """
    Sanitize error messages to hide raw HTML/technical details from users.
    Logs full details server-side.
    """
    # Log full error for debugging
    logger.error(f"Model error from {endpoint}: {error_text[:500]}...")

    # Check for common error patterns and return user-friendly messages
    error_lower = error_text.lower()

    if "cloudflare" in error_lower or "<!doctype" in error_lower or "<html" in error_lower:
        return "Service temporarily unavailable. The model server may be down or experiencing issues."

    if "timeout" in error_lower:
        return "Request timed out. Please try again."

    if "connection refused" in error_lower or "connect error" in error_lower:
        return "Cannot connect to model server. Please try again later."

    if "502" in error_text or "503" in error_text or "504" in error_text:
        return "Model server is temporarily unavailable."

    if "520" in error_text or "521" in error_text or "522" in error_text:
        return "Service temporarily unavailable (CDN error)."

    # Strip any HTML tags as a fallback
    clean_text = re.sub(r'<[^>]+>', '', error_text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Truncate if still too long
    if len(clean_text) > 200:
        return clean_text[:200] + "..."

    return clean_text if clean_text else "An unexpected error occurred."

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

class DiscussionRequest(BaseModel):
    query: str
    max_tokens: int = 512
    temperature: float = 0.7
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen2.5-7b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    turns: int = 2  # Number of discussion rounds (all models participate each round)

# HTML Chat Interface
CHAT_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#1e3a5f">
  <title>LLM Arena</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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

    html {
      height: 100%;
      height: -webkit-fill-available;
    }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      height: calc(var(--vh, 1vh) * 100);
      height: 100dvh;
      min-height: -webkit-fill-available;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: background-color 0.3s, color 0.3s;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
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
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-history {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
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
      padding: 0.2em 0.45em;
      border-radius: 4px;
      font-size: 0.875em;
      border: 1px solid var(--border-color);
      color: var(--accent-color);
    }
    .message-content pre {
      background-color: var(--bg-secondary);
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1em 0;
      border: 1px solid var(--border-color);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .message-content pre code {
      background: transparent;
      padding: 0;
      border: none;
      color: var(--text-primary);
      font-size: 0.85em;
      line-height: 1.6;
    }
    [data-theme="dark"] .message-content code {
      color: #93c5fd;
    }
    [data-theme="dark"] .message-content pre {
      background-color: #0d1117;
      border-color: #21262d;
    }

    /* Markdown styles for marked.js output */
    .message-content p {
      margin: 0 0 0.75em 0;
    }
    .message-content p:last-child {
      margin-bottom: 0;
    }
    .message-content h1,
    .message-content h2 {
      font-size: 1.15em;
      font-weight: 600;
      margin: 1em 0 0.5em 0;
      color: var(--text-primary);
      padding-bottom: 0.25em;
      border-bottom: 1px solid var(--border-color);
    }
    .message-content h3 {
      font-size: 1.05em;
      font-weight: 600;
      margin: 0.9em 0 0.4em 0;
      color: var(--text-primary);
    }
    .message-content h4,
    .message-content h5,
    .message-content h6 {
      font-size: 0.95em;
      font-weight: 600;
      margin: 0.75em 0 0.3em 0;
      color: var(--text-secondary);
    }
    .message-content h1:first-child,
    .message-content h2:first-child,
    .message-content h3:first-child,
    .message-content h4:first-child {
      margin-top: 0;
    }
    .message-content ul,
    .message-content ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
    .message-content ul {
      list-style-type: disc;
    }
    .message-content ol {
      list-style-type: decimal;
    }
    .message-content li {
      margin: 0.25em 0;
      line-height: 1.5;
    }
    .message-content li > p {
      margin: 0;
    }
    .message-content li::marker {
      color: var(--accent-color);
    }
    .message-content strong {
      font-weight: 600;
      color: var(--text-primary);
    }
    .message-content em {
      font-style: italic;
    }
    .message-content a {
      color: var(--accent-color);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.15s ease;
    }
    .message-content a:hover {
      border-bottom-color: var(--accent-color);
    }
    .message-content blockquote {
      margin: 0.75em 0;
      padding: 0.5em 1em;
      border-left: 3px solid var(--accent-color);
      background: var(--bg-secondary);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);
    }
    .message-content blockquote p {
      margin: 0;
    }
    .message-content hr {
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 1em 0;
    }
    .message-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75em 0;
      font-size: 0.9em;
    }
    .message-content th,
    .message-content td {
      border: 1px solid var(--border-color);
      padding: 0.5em 0.75em;
      text-align: left;
    }
    .message-content th {
      background: var(--bg-secondary);
      font-weight: 600;
    }
    .message-content tr:nth-child(even) {
      background: var(--bg-secondary);
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
      flex-shrink: 0;
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

    .controls-secondary {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .control-group input, .control-group select {
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 12px;
    }

    /* Custom range slider - minimal robust styling */
    .control-group input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 80px;
      height: 20px;
      background: transparent;
      cursor: pointer;
      border: none;
      padding: 0;
      margin: 0;
    }

    .control-group input[type="range"]::-webkit-slider-runnable-track {
      width: 100%;
      height: 4px;
      background: var(--border-color);
      border-radius: 2px;
      border: none;
    }

    .control-group input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      background: var(--accent-color);
      border-radius: 50%;
      border: none;
      margin-top: -5px;
      cursor: pointer;
    }

    .control-group input[type="range"]::-moz-range-track {
      width: 100%;
      height: 4px;
      background: var(--border-color);
      border-radius: 2px;
      border: none;
    }

    .control-group input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      background: var(--accent-color);
      border-radius: 50%;
      border: none;
      cursor: pointer;
    }

    .control-group input[type="range"]:focus {
      outline: none;
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

    /* Streaming cursor animation */
    .cursor {
      display: inline;
      font-weight: 400;
      color: var(--accent-color);
      opacity: 0.8;
      animation: cursorBlink 1s ease-in-out infinite;
      margin-left: 1px;
    }

    @keyframes cursorBlink {
      0%, 45% { opacity: 0.8; }
      50%, 95% { opacity: 0; }
      100% { opacity: 0.8; }
    }

    .streaming-badge {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 4px;
      background: linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%) !important;
      color: white !important;
      font-weight: 500;
      letter-spacing: 0.02em;
      box-shadow: 0 1px 3px rgba(30, 58, 95, 0.2);
    }

    .streaming-badge::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      background: white;
      border-radius: 50%;
      margin-right: 5px;
      animation: streamingDot 1.2s ease-in-out infinite;
    }

    @keyframes streamingDot {
      0%, 100% { opacity: 0.4; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1); }
    }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
      header {
        padding: 12px 16px;
      }

      .logo-title {
        font-size: 16px;
      }

      .logo-subtitle {
        font-size: 10px;
      }

      .chat-history {
        padding: 0.75rem;
        gap: 1rem;
      }

      .welcome-card {
        padding: 16px;
      }

      .welcome-title {
        font-size: 14px;
      }

      .welcome-subtitle {
        font-size: 12px;
      }

      .message {
        font-size: 13px;
        max-width: 95%;
      }

      .message.user {
        padding: 10px 14px;
      }

      .message.assistant {
        padding: 12px;
      }

      .model-responses {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .model-response {
        padding: 12px;
      }

      .model-header {
        margin-bottom: 10px;
        padding-bottom: 6px;
      }

      .message-content {
        font-size: 13px;
      }

      .message-footer {
        flex-wrap: wrap;
        gap: 12px;
        font-size: 10px;
      }

      .input-container {
        padding: 0.75rem;
        padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
      }

      .controls-row {
        gap: 8px;
        margin-bottom: 10px;
      }

      .model-selector {
        width: 100%;
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 4px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .model-selector::-webkit-scrollbar {
        display: none;
      }

      .model-chip {
        padding: 8px 12px;
        font-size: 11px;
        flex-shrink: 0;
        min-height: 36px;
        display: flex;
        align-items: center;
      }

      .control-group {
        font-size: 11px;
      }

      .control-group input[type="range"] {
        width: 60px;
      }

      .control-group input[type="number"] {
        width: 60px;
        padding: 6px 8px;
      }

      .clear-btn {
        padding: 8px 10px;
        font-size: 11px;
        min-height: 36px;
      }

      textarea {
        font-size: 16px; /* Prevents zoom on iOS */
        padding: 10px 14px;
        min-height: 50px;
      }

      .input-footer {
        padding: 6px 10px;
      }

      .send-btn {
        padding: 10px 14px;
        font-size: 12px;
        min-height: 40px;
      }

      .typing-indicator {
        margin: 0.5rem 0.75rem;
      }
    }

    @media (max-width: 480px) {
      header {
        padding: 10px 12px;
      }

      .logo-icon {
        width: 28px;
        height: 28px;
        padding: 5px;
      }

      .logo-icon svg {
        width: 16px;
        height: 16px;
      }

      .logo {
        gap: 8px;
      }

      .logo-title {
        font-size: 14px;
      }

      .logo-subtitle {
        display: none;
      }

      .icon-btn {
        width: 32px;
        height: 32px;
      }

      .chat-history {
        padding: 0.5rem;
      }

      .welcome-card {
        padding: 14px;
      }

      .controls-row {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }

      .controls-row > div[style="flex: 1;"] {
        display: none;
      }

      .model-selector {
        order: 1;
      }

      .controls-secondary {
        display: flex;
        gap: 8px;
        order: 2;
        justify-content: space-between;
        align-items: center;
      }

      .control-group {
        flex: 1;
      }

      .control-group input[type="range"] {
        width: 50px;
      }

      .control-group input[type="number"] {
        width: 50px;
      }

      .input-container {
        padding: 0.5rem;
        padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
      }

      .input-wrapper {
        border-radius: 10px;
      }

      textarea {
        padding: 10px 12px;
      }

      .send-btn {
        padding: 8px 12px;
      }

      .send-btn span {
        display: none;
      }

      .send-btn svg {
        width: 18px;
        height: 18px;
      }

      .message.user {
        padding: 8px 12px;
        border-radius: 12px 12px 4px 12px;
      }

      .model-response, .message.assistant {
        padding: 10px;
        border-radius: 10px;
      }

      .message-footer {
        margin-top: 10px;
        padding-top: 10px;
        gap: 8px;
      }

      .stat-item {
        min-width: 0;
      }

      .stat-label {
        font-size: 9px;
      }

      .stat-value {
        font-size: 10px;
      }
    }

    /* Safe area insets for notched devices */
    @supports (padding: env(safe-area-inset-bottom)) {
      .input-container {
        padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
      }

      @media (max-width: 768px) {
        .input-container {
          padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
        }
      }

      @media (max-width: 480px) {
        .input-container {
          padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
        }
      }
    }

    /* Landscape mode on mobile */
    @media (max-height: 500px) and (orientation: landscape) {
      header {
        padding: 8px 16px;
      }

      .logo-subtitle {
        display: none;
      }

      .chat-history {
        padding: 0.5rem;
        gap: 0.75rem;
      }

      .welcome-card {
        padding: 12px;
      }

      textarea {
        min-height: 40px;
        max-height: 80px;
      }

      .controls-row {
        margin-bottom: 8px;
      }
    }

    /* Touch-friendly improvements */
    @media (hover: none) and (pointer: coarse) {
      .model-chip {
        min-height: 44px;
        padding: 10px 14px;
      }

      .icon-btn {
        min-width: 44px;
        min-height: 44px;
      }

      .send-btn {
        min-height: 44px;
      }

      .clear-btn {
        min-height: 44px;
      }

      .control-group input, .control-group select {
        min-height: 36px;
      }
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
      <a href="/discussion" class="icon-btn" title="Switch to Roundtable Mode">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"></polyline>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <polyline points="7 23 3 19 7 15"></polyline>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
      </a>
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
        <div class="controls-secondary">
          <div class="control-group">
            <label>Temp:</label>
            <input type="range" id="tempSlider" min="0" max="1" step="0.1" value="0.7">
            <span id="tempValue">0.7</span>
          </div>
          <div class="control-group">
            <label>Tokens:</label>
            <input type="number" id="maxTokens" value="512" min="1" max="4096" style="width: 70px;">
          </div>
          <button class="clear-btn" onclick="clearChat()">Clear</button>
        </div>
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
    // Mobile viewport height fix
    function setViewportHeight() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(setViewportHeight, 100);
    });

    // Handle virtual keyboard on mobile
    if ('visualViewport' in window) {
      window.visualViewport.addEventListener('resize', () => {
        document.body.style.height = `${window.visualViewport.height}px`;
      });
    }

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

    // Handle send button click (works on both desktop and mobile)
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sendMessage();
    });

    // Also handle touch events for better mobile responsiveness
    sendBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      sendMessage();
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

    // Configure marked.js
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });

    // Custom renderer for better styling
    const renderer = new marked.Renderer();

    // Make links open in new tab
    renderer.link = function(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    marked.use({ renderer });

    function formatContent(content) {
      if (!content) return '';

      try {
        // Use marked.js for proper markdown parsing
        return marked.parse(content);
      } catch (e) {
        // Fallback: escape HTML and preserve line breaks
        return content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\\n/g, '<br>');
      }
    }

    // Create streaming response container
    function createStreamingContainer(models) {
      const modelData = {};

      if (models.length === 1) {
        const modelName = MODELS[models[0]]?.name || models[0];
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.innerHTML = `
          <div class="model-header">
            <span class="model-name">${modelName}</span>
            <span class="model-badge streaming-badge">Streaming...</span>
          </div>
          <div class="message-content" data-model="${modelName}"><span class="cursor">▋</span></div>
          <div class="message-footer" style="display: none;" data-footer="${modelName}">
            <div class="stat-item">
              <span class="stat-label">Tokens</span>
              <span class="stat-value" data-tokens="${modelName}">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Time</span>
              <span class="stat-value" data-time="${modelName}">-</span>
            </div>
          </div>
        `;
        chatHistory.appendChild(messageDiv);
        modelData[modelName] = { content: '', element: messageDiv };
      } else {
        const container = document.createElement('div');
        container.className = 'model-responses';

        for (const modelId of models) {
          const modelName = MODELS[modelId]?.name || modelId;
          const responseDiv = document.createElement('div');
          responseDiv.className = 'model-response';
          responseDiv.innerHTML = `
            <div class="model-header">
              <span class="model-name">${modelName}</span>
              <span class="model-badge streaming-badge">Waiting...</span>
            </div>
            <div class="message-content" data-model="${modelName}"><span class="cursor">▋</span></div>
            <div class="message-footer" style="display: none;" data-footer="${modelName}">
              <div class="stat-item">
                <span class="stat-label">Tokens</span>
                <span class="stat-value" data-tokens="${modelName}">-</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Time</span>
                <span class="stat-value" data-time="${modelName}">-</span>
              </div>
            </div>
          `;
          container.appendChild(responseDiv);
          modelData[modelName] = { content: '', element: responseDiv };
        }
        chatHistory.appendChild(container);
      }

      chatHistory.scrollTop = chatHistory.scrollHeight;
      return modelData;
    }

    // Update streaming content for a model
    function updateStreamingContent(modelData, modelName, content, isToken = true) {
      if (!modelData[modelName]) return;

      if (isToken) {
        modelData[modelName].content += content;
      }

      const contentEl = modelData[modelName].element.querySelector(`[data-model="${modelName}"]`);
      if (contentEl) {
        contentEl.innerHTML = formatContent(modelData[modelName].content) + '<span class="cursor">▋</span>';
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }

    // Finalize streaming for a model
    function finalizeStreaming(modelData, modelName, time, tokenEstimate, error = false) {
      if (!modelData[modelName]) return;

      const el = modelData[modelName].element;

      // Remove streaming badge
      const badge = el.querySelector('.streaming-badge');
      if (badge) {
        if (error) {
          badge.textContent = 'Error';
          badge.style.background = '#fecaca';
          badge.style.color = '#dc2626';
        } else {
          badge.remove();
        }
      }

      // Remove cursor
      const contentEl = el.querySelector(`[data-model="${modelName}"]`);
      if (contentEl) {
        contentEl.innerHTML = formatContent(modelData[modelName].content);
      }

      // Show footer with stats
      if (!error && time) {
        const footer = el.querySelector(`[data-footer="${modelName}"]`);
        if (footer) {
          footer.style.display = 'flex';
          const timeEl = el.querySelector(`[data-time="${modelName}"]`);
          const tokensEl = el.querySelector(`[data-tokens="${modelName}"]`);
          if (timeEl) timeEl.textContent = time.toFixed(2) + 's';
          if (tokensEl) tokensEl.textContent = tokenEstimate || '-';
        }
      }
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

      const models = Array.from(selectedModels);
      const modelData = createStreamingContainer(models);
      let firstContent = '';

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            models: models,
            messages: conversationHistory,
            max_tokens: parseInt(maxTokens.value),
            temperature: parseFloat(tempSlider.value)
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.event === 'start') {
                  // Model started streaming
                  const badge = modelData[data.model]?.element.querySelector('.streaming-badge');
                  if (badge) badge.textContent = 'Streaming...';
                } else if (data.event === 'token' && data.content) {
                  // Received a token
                  updateStreamingContent(modelData, data.model, data.content);
                } else if (data.event === 'done') {
                  // Model finished
                  if (!firstContent && data.total_content) {
                    firstContent = data.total_content;
                  }
                  finalizeStreaming(modelData, data.model, data.time, data.token_estimate);
                } else if (data.error) {
                  // Error occurred
                  modelData[data.model].content = data.content || 'Error occurred';
                  updateStreamingContent(modelData, data.model, '', false);
                  finalizeStreaming(modelData, data.model, null, null, true);
                } else if (data.event === 'all_done') {
                  // All models finished
                  typingIndicator.classList.remove('active');
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }

        // Add first successful response to conversation history
        if (firstContent) {
          conversationHistory.push({ role: 'assistant', content: firstContent });
        }

      } catch (error) {
        // Handle connection errors
        for (const modelName of Object.keys(modelData)) {
          modelData[modelName].content = `Connection error: ${error.message}`;
          updateStreamingContent(modelData, modelName, '', false);
          finalizeStreaming(modelData, modelName, null, null, true);
        }
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

    // Auto-focus the input field on page load
    // Use a small delay to ensure the page is fully rendered
    setTimeout(() => {
      userInput.focus();
    }, 100);

    // Re-focus input when clicking anywhere in the chat area (for convenience)
    chatHistory.addEventListener('click', () => {
      if (!window.getSelection().toString()) {
        userInput.focus();
      }
    });
  </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def chat_interface():
    return CHAT_HTML

@app.get("/discussion", response_class=HTMLResponse)
async def discussion_interface():
    """Serve discussion mode interface"""
    import pathlib
    discussion_html_path = pathlib.Path(__file__).parent / "static" / "discussion.html"
    if discussion_html_path.exists():
        return discussion_html_path.read_text()
    else:
        raise HTTPException(status_code=404, detail="Discussion interface not found")

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
            error_msg = sanitize_error_message(response.text, endpoint)
            return {
                "model": display_name,
                "content": error_msg,
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
        logger.error(f"Timeout querying {endpoint}")
        return {
            "model": display_name,
            "content": "Request timed out. Please try again.",
            "error": True,
            "time": time.time() - start_time
        }
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        return {
            "model": display_name,
            "content": "Cannot connect to model server. Please try again later.",
            "error": True,
            "time": time.time() - start_time
        }
    except Exception as e:
        logger.exception(f"Unexpected error querying {endpoint}")
        return {
            "model": display_name,
            "content": "An unexpected error occurred. Please try again.",
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


async def stream_model_response(model_id: str, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream response from a single model using SSE format"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)
    start_time = time.time()
    total_content = ""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{endpoint}/v1/chat/completions",
                json={
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": True
                }
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_msg = sanitize_error_message(error_text.decode(), endpoint)
                    yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': error_msg})}\n\n"
                    return

                # Send initial event
                yield f"data: {json.dumps({'model': display_name, 'event': 'start'})}\n\n"

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    total_content += content
                                    yield f"data: {json.dumps({'model': display_name, 'content': content, 'event': 'token'})}\n\n"
                        except json.JSONDecodeError:
                            pass

                # Send completion event with stats
                elapsed = time.time() - start_time
                token_count = len(total_content.split())  # Rough estimate
                yield f"data: {json.dumps({'model': display_name, 'event': 'done', 'time': elapsed, 'total_content': total_content, 'token_estimate': token_count})}\n\n"

    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'Request timed out. Please try again.'})}\n\n"
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'Cannot connect to model server. Please try again later.'})}\n\n"
    except Exception as e:
        logger.exception(f"Unexpected error streaming from {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'An unexpected error occurred. Please try again.'})}\n\n"


async def stream_multiple_models(models: list, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream responses from multiple models, yielding chunks in real-time as they arrive"""

    # Use a queue to collect chunks from all models in real-time
    queue: asyncio.Queue = asyncio.Queue()
    active_streams = len([m for m in models if m in MODEL_ENDPOINTS])
    completed_streams = 0

    async def stream_to_queue(model_id: str):
        """Stream from a single model and put chunks into the shared queue"""
        nonlocal completed_streams
        try:
            async for chunk in stream_model_response(model_id, messages, max_tokens, temperature):
                await queue.put(chunk)
        finally:
            completed_streams += 1
            # Signal completion when all streams are done
            if completed_streams >= active_streams:
                await queue.put(None)  # Sentinel to signal completion

    # Start all streams concurrently
    tasks = [
        asyncio.create_task(stream_to_queue(model_id))
        for model_id in models
        if model_id in MODEL_ENDPOINTS
    ]

    if not tasks:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    # Yield chunks as they arrive from any model
    try:
        while True:
            chunk = await queue.get()
            if chunk is None:  # Sentinel - all streams completed
                break
            yield chunk
    finally:
        # Ensure all tasks are cleaned up
        for task in tasks:
            if not task.done():
                task.cancel()

    # Send final done event
    yield f"data: {json.dumps({'event': 'all_done'})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: MultiChatRequest):
    """Stream chat responses using Server-Sent Events"""
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    return StreamingResponse(
        stream_multiple_models(request.models, messages, request.max_tokens, request.temperature),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def stream_discussion_events(
    query: str,
    max_tokens: int,
    temperature: float,
    orchestrator_model: Optional[str] = None,
    github_token: Optional[str] = None,
    turns: int = 2
) -> AsyncGenerator[str, None]:
    """
    Stream discussion events as Server-Sent Events

    Events:
    - analysis_start: Orchestrator begins analyzing query
    - analysis_complete: Query analysis results with domain weights
    - turn_start: Model begins responding
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with evaluation
    - synthesis_start: Begin creating final response
    - synthesis_complete: Synthesis plan ready
    - discussion_complete: Full discussion finished
    - error: Error occurred
    """
    try:
        # Determine orchestrator model type
        api_models = [
            'gpt-4.1', 'gpt-4o', 'gpt-4o-mini',
            'deepseek-v3-0324', 'cohere-command-r-plus-08-2024',
            'llama-3.3-70b-instruct', 'llama-4-scout-17b-16e-instruct', 'meta-llama-3.1-405b-instruct'
        ]
        local_models = list(MODEL_ENDPOINTS.keys())

        selected_orchestrator = orchestrator_model or 'gpt-4o'
        is_api_model = selected_orchestrator in api_models

        if is_api_model:
            # Initialize GitHub Models API orchestrator
            # Use user-provided token if available, otherwise fall back to server env var
            token = github_token or os.getenv("GH_MODELS_TOKEN")
            if not token:
                yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator. Please provide your token or contact the server admin.'})}\n\n"
                return

            orchestrator = GitHubModelsOrchestrator(
                github_token=token,
                model_id=selected_orchestrator
            )
        elif selected_orchestrator in local_models:
            # Initialize local model orchestrator
            local_endpoint = MODEL_ENDPOINTS[selected_orchestrator]
            orchestrator = GitHubModelsOrchestrator(
                github_token="local",  # Placeholder, won't be used
                model_id=selected_orchestrator,
                api_url=f"{local_endpoint}/v1/chat/completions"
            )
            # Override the headers method for local models
            orchestrator._get_headers = lambda: {"Content-Type": "application/json"}
        else:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Unknown orchestrator model: {selected_orchestrator}'})}\n\n"
            return

        # Initialize discussion engine
        engine = DiscussionEngine(
            orchestrator=orchestrator,
            model_endpoints=MODEL_ENDPOINTS,
            timeout_per_turn=60
        )

        # Run discussion with streaming events
        async for event in engine.run_discussion(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature,
            turns=turns
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Discussion error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@app.post("/api/chat/discussion/stream")
async def discussion_stream(request: DiscussionRequest):
    """
    Stream collaborative multi-model discussion using Server-Sent Events

    Models discuss the query together, guided by an orchestrator (GPT-5-nano)
    that evaluates contributions based on each model's benchmark-proven strengths.

    Request body:
    - query: User's question or request
    - max_tokens: Max tokens per model response (default: 512)
    - temperature: Sampling temperature (default: 0.7)

    Stream events (all sent as SSE):
    - analysis_complete: Orchestrator's query analysis with domain classification
    - turn_start: Model begins turn with expertise score
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with quality evaluation
    - synthesis_complete: Final synthesis plan
    - discussion_complete: Full discussion with final response
    - error: Error details
    """
    return StreamingResponse(
        stream_discussion_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.orchestrator_model,
            request.github_token,
            request.turns
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
