"""
Pydantic models for API request/response validation
"""

from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class GenerationParams(BaseModel):
    max_tokens: int = 2048
    temperature: float = 0.7


class ChatRequest(GenerationParams):
    model: str
    messages: List[ChatMessage]


class MultiChatRequest(GenerationParams):
    models: List[str]
    messages: List[ChatMessage]
    github_token: Optional[str] = None  # User-provided token for API models
    openrouter_key: Optional[str] = None  # User-provided OpenRouter API key


class DiscussionRequest(GenerationParams):
    query: str
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen3-4b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    openrouter_key: Optional[str] = None  # User-provided OpenRouter API key
    turns: int = 2  # Number of discussion rounds (all models participate each round)
    participants: Optional[List[str]] = None  # List of model IDs to participate (default: all local models)
    system_prompt: Optional[str] = None  # Optional system prompt to prepend to messages
