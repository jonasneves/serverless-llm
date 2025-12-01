"""
Model Router - Routes tool calls to appropriate specialized models
Maps ToolOrchestra's model naming to your existing Qwen/Phi/Llama servers
"""

import os
import logging
import httpx
from typing import Dict, Any, Optional
from http_client import HTTPClient

logger = logging.getLogger(__name__)


class ModelRouter:
    """Routes tool calls to specialized models"""

    # Map ToolOrchestra model names to your API endpoints
    MODEL_MAPPING = {
        # Reasoning models
        "reasoner-1": {
            "name": "Qwen 2.5-7B",
            "url_env": "QWEN_API_URL",
            "description": "Strong reasoning and coding"
        },
        "reasoner-2": {
            "name": "Phi-3 Mini",
            "url_env": "PHI_API_URL",
            "description": "Good reasoning, instruction following"
        },
        "reasoner-3": {
            "name": "Llama 3.2-3B",
            "url_env": "LLAMA_API_URL",
            "description": "Fast, basic reasoning"
        },
        # Answer models
        "answer-1": {
            "name": "Qwen 2.5-7B",
            "url_env": "QWEN_API_URL",
            "description": "Comprehensive answers"
        },
        "answer-2": {
            "name": "Phi-3 Mini",
            "url_env": "PHI_API_URL",
            "description": "Moderate complexity"
        },
        "answer-3": {
            "name": "Llama 3.2-3B",
            "url_env": "LLAMA_API_URL",
            "description": "Simple queries, conversational"
        },
    }

    def __init__(self):
        self.model_urls = {}
        # Default URLs for GitHub workflow deployments
        default_urls = {
            "QWEN_API_URL": "https://qwen.neevs.io",
            "PHI_API_URL": "https://phi.neevs.io",
            "LLAMA_API_URL": "https://llama.neevs.io"
        }
        # Load API URLs from environment (with defaults)
        for model_id, config in self.MODEL_MAPPING.items():
            url = os.getenv(config["url_env"], default_urls.get(config["url_env"]))
            if url:
                self.model_urls[model_id] = url
            else:
                logger.warning(f"No URL configured for {model_id} (env: {config['url_env']})")

    async def call_model(
        self,
        model_id: str,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Call a specialized model via its API endpoint

        Args:
            model_id: ToolOrchestra model ID (e.g., "reasoner-1", "answer-2")
            prompt: User prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            system_prompt: Optional system prompt

        Returns:
            Dict with 'content', 'model_name', 'tokens_used'
        """
        if model_id not in self.model_urls:
            raise ValueError(f"Model {model_id} not configured. Available: {list(self.model_urls.keys())}")

        api_url = self.model_urls[model_id]
        model_name = self.MODEL_MAPPING[model_id]["name"]

        # Prepare messages
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Call the model via OpenAI-compatible API
        client = HTTPClient.get_client()
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False
        }

        try:
            response = await client.post(
                f"{api_url}/v1/chat/completions",
                json=payload
            )
            if response.status_code != 200:
                error_text = response.text
                raise Exception(f"Model API error ({model_name}): {response.status_code} - {error_text}")

            data = response.json()

            return {
                "content": data["choices"][0]["message"]["content"],
                "model_name": model_name,
                "model_id": model_id,
                "tokens_used": data.get("usage", {}).get("total_tokens", 0)
            }

        except httpx.HTTPError as e:
            logger.error(f"Failed to call {model_name}: {e}")
            raise Exception(f"Failed to call {model_name}: {str(e)}")

    async def enhance_reasoning(
        self,
        model: str,
        problem: str,
        context: str = "",
        reasoning_focus: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enhance reasoning tool implementation

        Args:
            model: reasoner-1/2/3
            problem: The problem to reason about
            context: Additional context
            reasoning_focus: What to focus on

        Returns:
            Dict with reasoning output
        """
        # Build prompt
        prompt = ""
        if context:
            prompt += f"{context}\n\n"

        prompt += f"Problem: {problem}\n\n"

        if reasoning_focus:
            prompt += f"Focus on: {reasoning_focus}\n\n"

        prompt += (
            "Please reason through this problem step-by-step. "
            "If helpful, write Python code to verify your reasoning. "
            "Wrap code in ```python blocks."
        )

        system_prompt = (
            "You are a logical reasoning expert. Break down complex problems "
            "into clear steps and verify your logic where possible."
        )

        result = await self.call_model(
            model_id=model,
            prompt=prompt,
            max_tokens=2048,
            temperature=0.2,  # Lower temp for reasoning
            system_prompt=system_prompt
        )

        result["tool"] = "enhance_reasoning"
        return result

    async def answer(
        self,
        model: str,
        problem: str,
        context: str = ""
    ) -> Dict[str, Any]:
        """
        Answer tool implementation

        Args:
            model: answer-1/2/3
            problem: The question to answer
            context: Additional context (docs, reasoning, etc.)

        Returns:
            Dict with answer
        """
        # Build prompt
        prompt = ""
        if context:
            prompt += f"Context:\n{context}\n\n"

        prompt += f"Question: {problem}\n\n"
        prompt += "Provide a comprehensive answer based on the available information."

        system_prompt = "You are a helpful AI assistant. Provide clear, accurate answers."

        result = await self.call_model(
            model_id=model,
            prompt=prompt,
            max_tokens=2048,
            temperature=0.7,
            system_prompt=system_prompt
        )

        result["tool"] = "answer"
        return result
