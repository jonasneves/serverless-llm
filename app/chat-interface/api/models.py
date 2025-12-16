"""
Pydantic models for API request/response validation
"""

from pydantic import BaseModel
from typing import List, Optional, Dict


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


class ModelStatus(BaseModel):
    model: str
    status: str
    endpoint: str


class CouncilRequest(BaseModel):
    query: str
    participants: List[str]  # List of model IDs to participate in council
    chairman_model: Optional[str] = None  # Optional chairman model (defaults to first participant)
    max_tokens: int = 2048  # Max tokens per response
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    completed_responses: Optional[Dict[str, str]] = None  # Already generated responses


class DiscussionRequest(GenerationParams):
    query: str
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen3-4b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    turns: int = 2  # Number of discussion rounds (all models participate each round)
    participants: Optional[List[str]] = None  # List of model IDs to participate (default: all local models)




class PersonalityRequest(BaseModel):
    query: str
    participants: List[str]  # List of model IDs to participate
    max_tokens: int = 512  # Max tokens per persona response
    github_token: Optional[str] = None  # User-provided GitHub token for API models
