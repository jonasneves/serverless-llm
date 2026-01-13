"""
Analyze Mode - Post-hoc Analysis of Multiple Model Responses

After all models complete their responses, analyzes:
- Consensus: What all/most models agree on
- Divergence: Where models disagree
- Unique contributions: What only specific models mentioned
"""

from typing import List, Dict, Any, AsyncGenerator
import asyncio
from clients.model_profiles import get_display_name
from clients.model_client import ModelClient
from prompts import ANALYZE_RESPONSE_SYSTEM


class AnalyzeEngine:
    """Analyzes completed responses to find consensus, divergence, and unique contributions"""

    def __init__(
        self,
        model_endpoints: Dict[str, str],
        github_token: str = None,
        openrouter_key: str = None,
        timeout: int = 60
    ):
        """
        Initialize analyze engine

        Args:
            model_endpoints: Dict mapping model_id -> API URL for local models
            github_token: GitHub token for API models
            openrouter_key: OpenRouter API key
            timeout: Max seconds per response
        """
        self.model_endpoints = model_endpoints
        self.github_token = github_token
        self.openrouter_key = openrouter_key
        self.timeout = timeout
        self.client = ModelClient(github_token, openrouter_key)

    async def _stream_model_response(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream a single model's response"""
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

    def _extract_key_points(self, response: str) -> List[str]:
        """Extract key points from a response (simple sentence splitting)"""
        sentences = [s.strip() for s in response.replace('\n', ' ').split('.') if s.strip()]
        return [s for s in sentences if len(s) > 20][:5]

    def _find_consensus(self, responses: List[Dict[str, str]]) -> List[str]:
        """Find points mentioned by multiple models (simple keyword overlap)"""
        if len(responses) < 2:
            return []

        all_points = []
        for resp in responses:
            points = self._extract_key_points(resp['response'])
            all_points.extend(points)

        # Simple heuristic: if similar keywords appear in multiple responses
        word_counts = {}
        for point in all_points:
            words = set(point.lower().split())
            for word in words:
                if len(word) > 4:  # Skip short words
                    word_counts[word] = word_counts.get(word, 0) + 1

        # Find common themes (words mentioned by at least half the models)
        threshold = len(responses) / 2
        common_words = {word for word, count in word_counts.items() if count >= threshold}

        # Return points that contain common words
        consensus = []
        for point in all_points:
            words = set(point.lower().split())
            if words & common_words and point not in consensus:
                consensus.append(point)
                if len(consensus) >= 3:
                    break

        return consensus

    def _find_unique_contributions(self, responses: List[Dict[str, str]]) -> Dict[str, List[str]]:
        """Find points mentioned by only one model"""
        unique = {}
        all_points_by_model = {
            resp['model_id']: self._extract_key_points(resp['response'])
            for resp in responses
        }

        # Compare each model's points against all others
        for model_id, points in all_points_by_model.items():
            other_points = []
            for other_id, other_pts in all_points_by_model.items():
                if other_id != model_id:
                    other_points.extend(other_pts)

            # Find points unique to this model (simple keyword check)
            model_unique = []
            for point in points:
                words = set(point.lower().split())
                is_unique = True
                for other_point in other_points:
                    other_words = set(other_point.lower().split())
                    overlap = len(words & other_words) / max(len(words), len(other_words))
                    if overlap > 0.5:  # More than 50% word overlap
                        is_unique = False
                        break
                if is_unique:
                    model_unique.append(point)
                    if len(model_unique) >= 2:
                        break

            if model_unique:
                unique[model_id] = model_unique

        return unique

    async def run_analyze(
        self,
        query: str,
        participants: List[str],
        max_tokens: int = 2048,
        system_prompt: str = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run analyze mode: collect responses, then analyze

        Args:
            query: User query
            participants: List of model IDs to participate
            max_tokens: Max tokens per response
            system_prompt: Optional additional system prompt to prepend

        Yields:
            Events: analyze_start, model_start, model_chunk, model_response,
                   analysis_complete, analyze_complete
        """
        if not participants:
            yield {"type": "error", "error": "No participants selected"}
            return

        yield {"type": "analyze_start", "participants": participants}

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "system", "content": ANALYZE_RESPONSE_SYSTEM})
        messages.append({"role": "user", "content": query})
        model_responses = {model_id: "" for model_id in participants}
        results = []

        # Stage 1: Collect all responses (parallel streaming)
        async def stream_model(model_id: str):
            """Stream a single model and yield events"""
            model_name = get_display_name(model_id)

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
                    yield {
                        "type": "model_chunk",
                        "model_id": model_id,
                        "model_name": model_name,
                        "chunk": event["chunk"],
                        "full_response": event["full_response"]
                    }
                elif event.get("complete"):
                    raw_response = event["full_response"]
                    # Strip thinking tags from final response
                    from prompts import strip_thinking_tags
                    final_response = strip_thinking_tags(raw_response)
                    model_responses[model_id] = final_response
                    results.append({
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response
                    })
                    yield {
                        "type": "model_response",
                        "model_id": model_id,
                        "model_name": model_name,
                        "response": final_response
                    }

        # Stream all models concurrently
        tasks = [stream_model(model_id) for model_id in participants]

        from services.streaming import merge_async_generators
        async for event in merge_async_generators(tasks):
            yield event

        # Stage 2: Analyze completed responses
        if not results:
            yield {"type": "error", "error": "All models failed"}
            return

        consensus = self._find_consensus(results)
        unique = self._find_unique_contributions(results)

        yield {
            "type": "analysis_complete",
            "consensus": consensus,
            "unique_contributions": unique,
            "total_responses": len(results)
        }

        yield {
            "type": "analyze_complete",
            "results": results,
            "consensus": consensus,
            "unique_contributions": unique
        }
