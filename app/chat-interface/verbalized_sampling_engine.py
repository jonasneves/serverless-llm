"""
Verbalized Sampling Mode
Implements the Stanford research technique to unlock LLM diversity and creativity
Paper: "Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity"
"""

import logging
from typing import AsyncGenerator, Dict, Any, List
import httpx

logger = logging.getLogger(__name__)


class VerbalizedSamplingEngine:
    """
    Engine for Verbalized Sampling - a prompting technique that mitigates mode collapse
    by asking the model to generate a distribution rather than a single response.
    
    The key insight: Instead of asking "Tell me a joke", we ask:
    "Generate 5 responses with their corresponding probabilities. Tell me a joke."
    
    This forces the model to tap into its diverse pre-trained distribution rather than
    the narrow post-aligned mode-collapsed outputs.
    """
    
    def __init__(self, model_endpoint: str, model_name: str):
        self.model_endpoint = model_endpoint
        self.model_name = model_name
        
    async def generate_diverse_responses(
        self,
        query: str,
        num_responses: int = 5,
        temperature: float = 0.8,
        max_tokens: int = 1024
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Generate diverse responses using Verbalized Sampling technique
        
        Args:
            query: User's original query
            num_responses: Number of diverse responses to generate (default: 5)
            temperature: Higher temperature for more diversity (default: 0.8)
            max_tokens: Max tokens per response
            
        Yields:
            Events with diverse responses and metadata
        """
        
        # Start event
        yield {
            "event": "start",
            "query": query,
            "model": self.model_name,
            "technique": "Verbalized Sampling",
            "num_responses": num_responses
        }
        
        # Verbalized Sampling prompt prefix
        vs_prompt = f"""Generate {num_responses} diverse and creative responses with their corresponding probabilities or confidence levels.

Original query: {query}

Please provide {num_responses} distinct responses that showcase different perspectives, styles, or approaches. For each response, indicate its probability or your confidence level.

Format your answer as:
Response 1 (probability: X%): [your response]
Response 2 (probability: Y%): [your response]
...and so on."""
        
        try:
            # Call the model with verbalized sampling prompt
            full_url = f"{self.model_endpoint}/v1/chat/completions"
            logger.info(f"Verbalized Sampling calling {self.model_name} at {full_url}")
            
            from http_client import HTTPClient
            client = HTTPClient.get_client()
            
            async with client.stream(
                "POST",
                full_url,
                json={
                    "model": "model",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a creative AI assistant that can generate diverse, high-quality responses. When asked for multiple responses, you provide genuinely different perspectives rather than minor variations."
                        },
                        {
                            "role": "user",
                            "content": vs_prompt
                        }
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True
                },
                timeout=60.0
            ) as response:
                
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_msg = f"Model API error from {full_url}: Status {response.status_code}, {error_text.decode('utf-8')[:200]}"
                    logger.error(error_msg)
                    yield {
                        "event": "error",
                        "error": error_msg
                    }
                    return
                
                # Stream the response
                full_response = ""
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        if line.strip() == "data: [DONE]":
                            break
                        
                        try:
                            import json
                            data = json.loads(line[6:])
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    full_response += content
                                    yield {
                                        "event": "chunk",
                                        "content": content
                                    }
                        except json.JSONDecodeError:
                            continue
                
                # Parse the responses
                parsed_responses = self._parse_verbalized_responses(full_response, num_responses)
                
                yield {
                    "event": "complete",
                    "full_response": full_response,
                    "parsed_responses": parsed_responses,
                    "diversity_score": self._calculate_diversity_score(parsed_responses)
                }
                
        except Exception as e:
            logger.error(f"Verbalized Sampling error: {e}", exc_info=True)
            yield {
                "event": "error",
                "error": str(e)
            }
    
    def _parse_verbalized_responses(self, response_text: str, expected_count: int) -> List[Dict[str, Any]]:
        """
        Parse the verbalized sampling response into individual responses
        
        Returns:
            List of dicts with 'response', 'probability', 'index'
        """
        responses = []
        lines = response_text.split('\n')
        current_response = None
        current_text = []
        
        for line in lines:
            # Look for patterns like "Response 1 (probability: 30%):" or "Response 1:"
            if line.strip().startswith(("Response ", "1.", "2.", "3.", "4.", "5.")):
                # Save previous response
                if current_response is not None:
                    current_response["response"] = "\n".join(current_text).strip()
                    responses.append(current_response)
                
                # Start new response
                current_response = {
                    "index": len(responses) + 1,
                    "probability": None,
                    "response": ""
                }
                current_text = []
                
                # Try to extract probability
                if "probability" in line.lower() or "confidence" in line.lower():
                    import re
                    prob_match = re.search(r'(\d+(?:\.\d+)?)\s*%', line)
                    if prob_match:
                        current_response["probability"] = f"{prob_match.group(1)}%"
                
                # Add the line content after the prefix
                if ":" in line:
                    content_after_colon = line.split(":", 1)[1].strip()
                    if content_after_colon:
                        current_text.append(content_after_colon)
            else:
                # Continue building current response
                if current_response is not None and line.strip():
                    current_text.append(line)
        
        # Don't forget the last response
        if current_response is not None:
            current_response["response"] = "\n".join(current_text).strip()
            responses.append(current_response)
        
        # If parsing failed, return the whole response as one item
        if not responses:
            responses.append({
                "index": 1,
                "probability": None,
                "response": response_text.strip()
            })
        
        return responses
    
    def _calculate_diversity_score(self, responses: List[Dict[str, Any]]) -> float:
        """
        Calculate a simple diversity score based on response lengths and uniqueness
        This is a simplified heuristic - real diversity would need semantic analysis
        
        Returns:
            Diversity score between 0 and 1
        """
        if len(responses) <= 1:
            return 0.0
        
        # Check length variance
        lengths = [len(r["response"]) for r in responses]
        avg_length = sum(lengths) / len(lengths)
        length_variance = sum((l - avg_length) ** 2 for l in lengths) / len(lengths)
        
        # Check word uniqueness across responses
        all_words = set()
        response_words = []
        for r in responses:
            words = set(r["response"].lower().split())
            response_words.append(words)
            all_words.update(words)
        
        # Calculate Jaccard distance between consecutive responses
        distances = []
        for i in range(len(response_words) - 1):
            intersection = len(response_words[i] & response_words[i + 1])
            union = len(response_words[i] | response_words[i + 1])
            if union > 0:
                jaccard_distance = 1 - (intersection / union)
                distances.append(jaccard_distance)
        
        avg_distance = sum(distances) / len(distances) if distances else 0.0
        
        # Combine metrics (simple weighted average)
        diversity_score = min(1.0, (avg_distance * 0.7 + min(1.0, length_variance / 1000) * 0.3))
        
        return round(diversity_score, 3)

