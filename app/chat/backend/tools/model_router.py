"""
Model Router - Routes tool calls to appropriate specialized models
Maps ToolOrchestra's model naming to your existing Qwen/Phi/Llama servers
"""

import os
import logging
import httpx
from typing import Dict, Any, Optional

from core.state import get_http_client
from core.config import DEFAULT_REMOTE_ENDPOINTS
from middleware.error_utils import sanitize_error_message

logger = logging.getLogger(__name__)


class ModelRouter:
    """Routes tool calls to specialized models"""

    # Map ToolOrchestra model names to API endpoints (Dec 2025 capability ranking)
    MODEL_MAPPING = {
        # Reasoning models (ranked by capability)
        "reasoner-1": {  # Rank 1
            "name": "Qwen3 4B",
            "url_env": "QWEN_API_URL",
            "description": "Best overall: multilingual (119 langs), 1M context, reasoning/coding"
        },
        "reasoner-2": {  # Rank 2
            "name": "DeepSeek R1 1.5B",
            "url_env": "R1QWEN_API_URL",
            "description": "o1-preview level reasoning, 96.3% Codeforces, step-by-step"
        },
        "reasoner-3": {  # Rank 3
            "name": "Gemma 3 12B",
            "url_env": "GEMMA_API_URL",
            "description": "Stronger instruction-following, safety-aligned, fact-checking"
        },
        "reasoner-4": {  # Rank 4
            "name": "Mistral 7B v0.3",
            "url_env": "MISTRAL_API_URL",
            "description": "Fast instruction-following, structured output"
        },
        "reasoner-5": {  # Rank 5
            "name": "Phi-3 Mini",
            "url_env": "PHI_API_URL",
            "description": "Compact reasoning, good instruction following"
        },
        "reasoner-6": {  # Rank 6
            "name": "RNJ-1 Instruct",
            "url_env": "RNJ_API_URL",
            "description": "70% SWE-Bench, strong tool-calling/agentic"
        },
        "reasoner-7": {  # Rank 7
            "name": "Llama 3.2 3B",
            "url_env": "LLAMA_API_URL",
            "description": "Lightweight, 131K context, creative writing"
        },
        "reasoner-8": {  # Rank 8
            "name": "LFM2 2.6B",
            "url_env": "LFM2_API_URL",
            "description": "Hybrid small model with strong instruction following"
        },
        # Answer models (same ranking)
        "answer-1": {  # Rank 1
            "name": "Qwen3 4B",
            "url_env": "QWEN_API_URL",
            "description": "Comprehensive multilingual answers"
        },
        "answer-2": {  # Rank 2
            "name": "DeepSeek R1 1.5B",
            "url_env": "R1QWEN_API_URL",
            "description": "Thoughtful chain-of-thought answers"
        },
        "answer-3": {  # Rank 3
            "name": "Gemma 3 12B",
            "url_env": "GEMMA_API_URL",
            "description": "Balanced, safe responses"
        },
        "answer-4": {  # Rank 4
            "name": "Mistral 7B v0.3",
            "url_env": "MISTRAL_API_URL",
            "description": "Fast, structured responses"
        },
        "answer-5": {  # Rank 5
            "name": "Phi-3 Mini",
            "url_env": "PHI_API_URL",
            "description": "Concise instruction-following"
        },
        "answer-6": {  # Rank 6
            "name": "RNJ-1 Instruct",
            "url_env": "RNJ_API_URL",
            "description": "Technical answers, code-focused"
        },
        "answer-7": {  # Rank 7
            "name": "Llama 3.2 3B",
            "url_env": "LLAMA_API_URL",
            "description": "Conversational, creative writing"
        },
        "answer-8": {  # Rank 8
            "name": "LFM2 2.6B",
            "url_env": "LFM2_API_URL",
            "description": "Hybrid small model with strong instruction following"
        },
    }

    def __init__(self):
        self.model_urls = {}
        # Default URLs for GitHub workflow deployments
        default_urls = DEFAULT_REMOTE_ENDPOINTS
        # Load API URLs from environment (empty strings fallback to defaults)
        for model_id, config in self.MODEL_MAPPING.items():
            env_val = os.getenv(config["url_env"])  # may be None or ""
            url = env_val if env_val else default_urls.get(config["url_env"])  # prefer env if non-empty
            if url:
                url = url.strip().rstrip("/")
                if not (url.startswith("http://") or url.startswith("https://")):
                    url = f"http://{url}"
                self.model_urls[model_id] = url
            else:
                logger.warning(f"No URL configured for {model_id} (env: {config['url_env']})")

    async def call_model(
        self,
        model_id: str,
        prompt: str,
        max_tokens: int = 2048,
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
        client = get_http_client()
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
                error_raw = response.text or ""
                error_msg = sanitize_error_message(error_raw, api_url)
                raise Exception(error_msg)

            data = response.json()

            if "usage" not in data or "total_tokens" not in data["usage"]:
                raise Exception(f"Missing usage data from {model_name}")

            if "choices" not in data or not data["choices"]:
                raise Exception(f"No choices in response from {model_name}")

            return {
                "content": data["choices"][0]["message"]["content"],
                "model_name": model_name,
                "model_id": model_id,
                "tokens_used": data["usage"]["total_tokens"]
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
