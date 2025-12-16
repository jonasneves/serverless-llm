"""
Base Engine Class for LLM Engines

Provides common functionality and standardized interfaces for all engine types.
"""

import logging
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Any, List, Optional

from clients.model_client import ModelClient
from utils.github_token import get_default_github_token
from middleware.error_utils import create_error_event

logger = logging.getLogger(__name__)


class BaseEngine(ABC):
    """
    Abstract base class for all LLM engines.
    
    Provides:
    - Unified ModelClient initialization
    - GitHub token management
    - Common streaming wrappers
    - Standardized error handling
    """
    
    def __init__(self, github_token: Optional[str] = None):
        """
        Initialize base engine with model client.
        
        Args:
            github_token: Optional GitHub token for API models.
                         Falls back to environment variables if not provided.
        """
        self.github_token = github_token or get_default_github_token()
        self.client = ModelClient(self.github_token)
        logger.info(f"Initialized {self.__class__.__name__} with ModelClient")
    
    async def stream_response(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Common streaming wrapper with error handling.
        
        Args:
            model_id: Model identifier
            messages: Chat messages
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            
        Yields:
            Standardized event dictionaries
        """
        try:
            async for event in self.client.stream_model(
                model_id=model_id,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            ):
                yield event
        except Exception as e:
            logger.error(f"Streaming error in {self.__class__.__name__}: {e}", exc_info=True)
            yield create_error_event(e, context=f"{self.__class__.__name__}.stream_response", model_id=model_id)
    
    async def call_model(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        response_format: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Common non-streaming call wrapper with error handling.
        
        Args:
            model_id: Model identifier
            messages: Chat messages
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            response_format: Optional structured output format
            
        Returns:
            Response dictionary with 'content' and optionally 'usage'
            
        Raises:
            Exception: Propagates any model calling errors
        """
        try:
            return await self.client.call_model(
                model_id=model_id,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format=response_format
            )
        except Exception as e:
            logger.error(f"Model call error in {self.__class__.__name__}: {e}", exc_info=True)
            raise
    
    @abstractmethod
    async def run(self, *args, **kwargs) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Main entry point for the engine. Must be implemented by subclasses.
        
        This method should orchestrate the engine's specific logic and yield
        appropriate events as the process progresses.
        
        Yields:
            Engine-specific event dictionaries
        """
        pass
