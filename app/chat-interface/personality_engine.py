"""
Personality Mode - Models Respond as Generated Personas

Flow:
1. Each model generates a unique personality/persona
2. Each model responds to the prompt as that persona
3. Responses are streamed in parallel
"""

from typing import List, Dict, Any, AsyncGenerator
import asyncio
import json
from model_profiles import get_display_name
from prompts import PERSONALITY_SIMPLE_SYSTEM
from model_client import ModelClient


class PersonalityEngine:
    """Orchestrates personality-based responses from multiple models"""

    def __init__(
        self,
        model_endpoints: Dict[str, str],
        github_token: str = None,
        timeout: int = 60
    ):
        """
        Initialize personality engine

        Args:
            model_endpoints: Dict mapping model_id -> API URL for local models
            github_token: GitHub token for API models
            timeout: Max seconds per response
        """
        self.model_endpoints = model_endpoints
        self.github_token = github_token
        self.timeout = timeout

        # Initialize unified model client
        self.client = ModelClient(github_token)

    async def _stream_model_response(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream a single model's response, yielding chunks as they arrive
        """
        try:
            full_response = ""
            async for event in self.client.stream_model(model_id, messages, max_tokens):
                if event["type"] == "chunk":
                    content = event["content"]
                    full_response += content
                    yield {"chunk": content, "full_response": full_response}
                elif event["type"] == "done":
                    full_response = event.get("full_content", full_response)
                    yield {"complete": True, "full_response": full_response}
                elif event["type"] == "error":
                    yield {"error": event["error"]}

        except Exception as e:
            yield {"error": str(e)}

    def _extract_persona_info(self, response: str) -> Dict[str, str]:
        """
        Extract persona emoji, name and trait from response

        Expected format:
        🎭 **[Persona Name]** - [Key trait]
        [Response...]

        Returns:
            Dict with persona_emoji, persona_name and persona_trait, or defaults if not found
        """
        lines = response.strip().split('\n')
        if not lines:
            return {
                "persona_emoji": "🎭",
                "persona_name": "Unknown",
                "persona_trait": "general perspective"
            }

        first_line = lines[0].strip()

        # Extract emoji (first character if it's an emoji)
        persona_emoji = "🎭"  # default
        text = first_line
        if first_line and ord(first_line[0]) > 127:  # Likely emoji/unicode
            persona_emoji = first_line[0]
            text = first_line[1:].strip()

        # Try to parse **Name** - trait format
        if '**' in text and '-' in text:
            try:
                name_part = text.split('**')[1] if len(text.split('**')) > 1 else ""
                parts = text.split('-')
                if len(parts) >= 2:
                    persona_name = name_part.strip() if name_part else parts[0].replace('**', '').strip()
                    persona_trait = parts[1].strip()
                    return {
                        "persona_emoji": persona_emoji,
                        "persona_name": persona_name,
                        "persona_trait": persona_trait
                    }
            except Exception:
                pass

        # Fallback: use defaults
        return {
            "persona_emoji": persona_emoji,
            "persona_name": "Unnamed Persona",
            "persona_trait": "unique perspective"
        }

    async def run_personality_mode(
        self,
        query: str,
        participants: List[str],
        max_tokens: int = 512
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run personality mode with streaming

        Args:
            query: User query
            participants: List of model IDs to participate
            max_tokens: Max tokens per response

        Yields:
            Events: personality_start, model_start, model_chunk, model_response, personality_complete
        """
        if not participants:
            yield {"type": "error", "error": "No participants selected"}
            return

        yield {"type": "personality_start", "participants": participants}

        # Build messages for each model
        messages = [
            {"role": "system", "content": PERSONALITY_SIMPLE_SYSTEM},
            {"role": "user", "content": query}
        ]

        model_responses = {model_id: "" for model_id in participants}
        persona_info = {}
        results = []

        # Create streaming tasks for all models
        async def stream_model(model_id: str):
            """Stream a single model and yield events"""
            model_name = get_display_name(model_id)

            # Notify that this model is starting
            yield {
                "type": "model_start",
                "model_id": model_id,
                "model_name": model_name
            }

            async for event in self._stream_model_response(model_id, messages, max_tokens):
                if "error" in event:
                    yield {
                        "type": "model_error",
                        "model_id": model_id,
                        "model_name": model_name,
                        "error": event["error"]
                    }
                    break
                elif "chunk" in event:
                    model_responses[model_id] = event["full_response"]

                    # Try to extract persona info as response streams in
                    if model_id not in persona_info and '\n' in event["full_response"]:
                        persona_info[model_id] = self._extract_persona_info(event["full_response"])

                    yield {
                        "type": "model_chunk",
                        "model_id": model_id,
                        "model_name": model_name,
                        "chunk": event["chunk"],
                        "full_response": event["full_response"],
                        "persona_info": persona_info.get(model_id, {})
                    }
                elif event.get("complete"):
                    final_response = event["full_response"]
                    model_responses[model_id] = final_response

                    # Extract final persona info
                    final_persona_info = self._extract_persona_info(final_response)
                    persona_info[model_id] = final_persona_info

                    results.append({
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response,
                        "persona_emoji": final_persona_info["persona_emoji"],
                        "persona_name": final_persona_info["persona_name"],
                        "persona_trait": final_persona_info["persona_trait"]
                    })

                    yield {
                        "type": "model_response",
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response,
                        "persona_emoji": final_persona_info["persona_emoji"],
                        "persona_name": final_persona_info["persona_name"],
                        "persona_trait": final_persona_info["persona_trait"]
                    }

        # Stream all models concurrently
        tasks = [stream_model(model_id) for model_id in participants]

        # Merge all streams
        from services.streaming import merge_async_generators
        async for event in merge_async_generators(tasks):
            yield event

        yield {"type": "personality_complete", "results": results}
