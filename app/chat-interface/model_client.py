"""
Unified Model Client
Handles interactions with both local and API models (GitHub Models),
abstracting away the differences in endpoints, authentication, and streaming.
"""

import json
import logging
import asyncio
import os
from typing import List, Dict, Any, AsyncGenerator, Optional
import httpx

from http_client import HTTPClient
from core.config import MODEL_ENDPOINTS
from model_profiles import MODEL_PROFILES, get_display_name
from constants import GITHUB_MODELS_API_URL
from error_utils import sanitize_error_message
from rate_limiter import get_rate_limiter
from core.state import UNSUPPORTED_GITHUB_MODELS, record_successful_inference

logger = logging.getLogger(__name__)

class ModelClient:
    def __init__(self, github_token: Optional[str] = None):
        self.github_token = github_token or os.getenv("GH_MODELS_TOKEN") or os.getenv("GITHUB_TOKEN")
        
        # Use centralized cache from core.state
        self.unsupported_github_models = UNSUPPORTED_GITHUB_MODELS

    def is_api_model(self, model_id: str) -> bool:
        """Check if a model is an API model (uses GitHub Models API)"""
        # Check static profiles
        profile = MODEL_PROFILES.get(model_id)
        if profile is not None and profile.get("model_type") == "api":
            return True

        # Check dynamic service
        try:
            from services.github_models_service import get_github_model_info
            if get_github_model_info(model_id):
                return True
        except ImportError:
            pass

        return False

    def _requires_system_conversion(self, model_id: str) -> bool:
        """Check if model doesn't support system role and needs conversion"""
        profile = MODEL_PROFILES.get(model_id, {})
        return profile.get("no_system_role", False)

    def _convert_system_messages(self, model_id: str, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        Convert system messages to user messages for models that don't support system role.
        Prepends system content to the first user message.
        """
        if not self._requires_system_conversion(model_id):
            return messages
        
        # Separate system and non-system messages
        system_content = []
        other_messages = []
        
        for msg in messages:
            if msg.get("role") == "system":
                system_content.append(msg.get("content", ""))
            else:
                other_messages.append(msg.copy())
        
        if not system_content:
            return messages  # No system messages to convert
        
        # Combine system content
        combined_system = "\n\n".join(system_content)
        
        # Prepend to first user message
        if other_messages and other_messages[0].get("role") == "user":
            other_messages[0]["content"] = f"[System Instructions]\n{combined_system}\n\n[User Message]\n{other_messages[0]['content']}"
        else:
            # No user message found, prepend as a new user message
            other_messages.insert(0, {"role": "user", "content": f"[System Instructions]\n{combined_system}"})
        
        logger.debug(f"Converted system messages for {model_id}: {len(system_content)} system -> user prefix")
        return other_messages

    def get_model_endpoint(self, model_id: str) -> str:
        """Get the endpoint URL for a local model"""
        if model_id not in MODEL_ENDPOINTS:
             raise ValueError(f"Unknown local model: {model_id}")
        return MODEL_ENDPOINTS[model_id]

    async def call_model(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7,
        response_format: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Make a non-streaming call to a model (local or API)
        Returns the full response content and usage.
        """
        # Convert system messages for models that don't support system role
        converted_messages = self._convert_system_messages(model_id, messages)
        
        if self.is_api_model(model_id):
            return await self._call_api_model(model_id, converted_messages, max_tokens, temperature, response_format)
        else:
            return await self._call_local_model(model_id, converted_messages, max_tokens, temperature, response_format)

    async def stream_model(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream response from a model.
        Yields standardized events:
        - {"type": "start", "model_id": ...}
        - {"type": "chunk", "content": ...}
        - {"type": "usage", "usage": ...}
        - {"type": "error", "error": ...}
        - {"type": "done", "full_content": ..., "usage": ...}
        """
        # Convert system messages for models that don't support system role
        converted_messages = self._convert_system_messages(model_id, messages)
        
        if self.is_api_model(model_id):
             async for event in self._stream_api_model(model_id, converted_messages, max_tokens, temperature):
                 yield event
        else:
             async for event in self._stream_local_model(model_id, converted_messages, max_tokens, temperature):
                 yield event

    async def _call_local_model(self, model_id, messages, max_tokens, temperature, response_format):
        endpoint = self.get_model_endpoint(model_id)
        url = f"{endpoint}/v1/chat/completions"
        
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if response_format:
            payload["response_format"] = response_format

        client = HTTPClient.get_client()
        try:
            response = await client.post(url, json=payload, timeout=120.0)
            
            if response.status_code != 200:
                 error_raw = response.text
                 error_msg = sanitize_error_message(error_raw, endpoint)
                 raise Exception(error_msg)
            
            data = response.json()
            if not data.get("choices"):
                 raise Exception("No choices returned from model")
                 
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            
            # Record successful inference for health tracking
            record_successful_inference(model_id)
            
            return {
                "content": content,
                "usage": usage,
                "model_id": model_id
            }
        except httpx.TimeoutException:
            raise Exception(f"Timeout calling local model {model_id}")
        except httpx.ConnectError:
            raise Exception(f"Connection refused for local model {model_id}")

    async def _call_api_model(self, model_id, messages, max_tokens, temperature, response_format):
        if not self.github_token:
            raise Exception("GitHub token required for API models")
            
        url = GITHUB_MODELS_API_URL
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.github_token}",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        # O-series models restrictions
        is_restricted = any(pattern in model_id.lower() for pattern in ['o1', 'o3', 'o4', 'gpt-5'])
        
        payload = {
             "model": model_id,
             "messages": messages,
        }
        if is_restricted:
             payload["max_completion_tokens"] = max_tokens
        else:
             payload["max_tokens"] = max_tokens
             payload["temperature"] = temperature
             
        if response_format:
             payload["response_format"] = response_format

        client = HTTPClient.get_client()
        rate_limiter = await get_rate_limiter(url, self.github_token, model_id=model_id)
        
        async with await rate_limiter.acquire():
            try:
                response = await client.post(url, headers=headers, json=payload, timeout=120.0)
                
                if response.status_code == 429:
                    rate_limiter.record_429()
                    raise Exception(f"Rate limit exceeded. Reset: {response.headers.get('x-ratelimit-reset')}")
                
                if response.status_code != 200:
                    error_raw = response.text
                    # Check for unknown model
                    if "unknown_model" in error_raw.lower():
                        self.unsupported_github_models.add(model_id)
                    raise Exception(sanitize_error_message(error_raw, url))
                    
                rate_limiter.record_success()
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                
                return {
                    "content": content,
                    "usage": usage,
                    "model_id": model_id
                }
            except httpx.TimeoutException:
                 raise Exception(f"Timeout calling API model {model_id}")

    async def _stream_local_model(self, model_id, messages, max_tokens, temperature):
        endpoint = self.get_model_endpoint(model_id)
        url = f"{endpoint}/v1/chat/completions"
        display_name = get_display_name(model_id)
        logger.info(f"Streaming from local model: {display_name} at {url}")
        
        yield {"type": "start", "model_id": model_id, "model_name": display_name}
        
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
            "stream_options": {"include_usage": True}
        }
        
        client = HTTPClient.get_client()
        full_content = ""
        final_usage = None
        
        try:
            async with client.stream("POST", url, json=payload, timeout=120.0) as response:
                if response.status_code != 200:
                     error_raw = await response.aread()
                     raise Exception(sanitize_error_message(error_raw.decode(), endpoint))
                
                async for line in response.aiter_lines():
                    if not line.startswith("data: "): continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]": break
                    
                    try:
                        chunk = json.loads(data_str)
                        # Usage
                        if "usage" in chunk:
                             final_usage = chunk["usage"]
                             yield {"type": "usage", "usage": final_usage, "model_id": model_id}
                        
                        # Content
                        if chunk.get("choices"):
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_content += content
                                yield {"type": "chunk", "content": content, "model_id": model_id}
                    except json.JSONDecodeError:
                        continue
                        
            # Record successful inference for health tracking
            record_successful_inference(model_id)
            
            yield {
                "type": "done", 
                "full_content": full_content, 
                "usage": final_usage,
                "model_id": model_id
            }
            
        except Exception as e:
            yield {"type": "error", "error": str(e), "model_id": model_id}

    async def _stream_api_model(self, model_id, messages, max_tokens, temperature):
        if not self.github_token:
             yield {"type": "error", "error": "GitHub token required", "model_id": model_id}
             return

        if model_id in self.unsupported_github_models:
             yield {"type": "error", "error": "Model not supported on API", "model_id": model_id}
             return

        url = GITHUB_MODELS_API_URL
        display_name = get_display_name(model_id)
        logger.info(f"Streaming from API model: {display_name}")
        yield {"type": "start", "model_id": model_id, "model_name": display_name}
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.github_token}",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        is_restricted = any(pattern in model_id.lower() for pattern in ['o1', 'o3', 'o4', 'gpt-5'])
        payload = {
             "model": model_id,
             "messages": messages,
             "stream": True,
             "stream_options": {"include_usage": True}
        }
        if is_restricted:
             payload["max_completion_tokens"] = max_tokens
        else:
             payload["max_tokens"] = max_tokens
             payload["temperature"] = temperature

        client = HTTPClient.get_client()
        rate_limiter = await get_rate_limiter(url, self.github_token, model_id=model_id)
        
        async with await rate_limiter.acquire():
            try:
                full_content = ""
                final_usage = None
                
                async with client.stream("POST", url, headers=headers, json=payload, timeout=120.0) as response:
                    if response.status_code == 429:
                        rate_limiter.record_429()
                        raise Exception(f"Rate limit exceeded")
                    
                    if response.status_code != 200:
                        error_raw = await response.aread()
                        decoded_error = error_raw.decode(errors='ignore')
                        if "unknown_model" in decoded_error.lower():
                             self.unsupported_github_models.add(model_id)
                        raise Exception(sanitize_error_message(decoded_error, url))
                    
                    rate_limiter.record_success()
                    
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "): continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]": break
                        
                        try:
                            chunk = json.loads(data_str)
                            if "usage" in chunk:
                                 final_usage = chunk["usage"]
                                 yield {"type": "usage", "usage": final_usage, "model_id": model_id}
                            
                            if chunk.get("choices"):
                                delta = chunk["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    full_content += content
                                    yield {"type": "chunk", "content": content, "model_id": model_id}
                        except json.JSONDecodeError:
                            continue
                
                yield {
                    "type": "done",
                    "full_content": full_content,
                    "usage": final_usage,
                    "model_id": model_id
                }

            except Exception as e:
                yield {"type": "error", "error": str(e), "model_id": model_id}
