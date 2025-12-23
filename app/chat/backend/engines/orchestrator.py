"""
Discussion Orchestrator using GPT-5-nano via GitHub Models API

This module provides intelligent orchestration for multi-model discussions,
using GPT-5-nano to analyze queries, evaluate contributions, and synthesize
final responses based on model expertise profiles.
"""

import os
import json
import logging
import aiohttp
from typing import List, Dict, Any, Optional, Type
from pydantic import BaseModel, Field
from enum import Enum
from middleware.rate_limiter import get_rate_limiter
from constants import GITHUB_MODELS_API_URL

# Configure logging
logger = logging.getLogger(__name__)


class DomainType(str, Enum):
    """Domain types for query classification"""
    MATHEMATICS = "mathematics"
    CODING = "coding"
    REASONING = "reasoning"
    CREATIVE_WRITING = "creative_writing"
    CONVERSATION = "conversation"
    SUMMARIZATION = "summarization"
    SCIENTIFIC = "scientific_knowledge"
    COMMON_SENSE = "common_sense"


# Map LLM synonym variations to canonical enum values
DOMAIN_ALIASES = {
    "logical_reasoning": "reasoning",
    "logic": "reasoning",
    "science": "scientific_knowledge",
    "general_knowledge": "common_sense",
}


class QueryAnalysis(BaseModel):
    """Structured output for initial query analysis"""
    query_domains: List[DomainType] = Field(description="Relevant domains for this query")
    domain_weights: Dict[str, float] = Field(description="Weight for each domain (sum to 1.0)")
    model_expertise_scores: Dict[str, float] = Field(description="Expertise score per model (0-1)")
    discussion_lead: str = Field(description="Model ID that should respond first")
    expected_turns: int = Field(description="Number of discussion rounds needed (2-4)", ge=2, le=4)
    reasoning: str = Field(description="Brief explanation of the analysis")


class ConfidenceLevel(str, Enum):
    """Confidence assessment levels"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TurnEvaluation(BaseModel):
    """Structured output for evaluating each model's turn"""
    quality_score: float = Field(description="Overall quality (0-1)", ge=0, le=1)
    relevance_score: float = Field(description="Relevance to query (0-1)", ge=0, le=1)
    expertise_alignment: float = Field(description="How well it used its strengths (0-1)", ge=0, le=1)
    confidence_assessment: ConfidenceLevel = Field(description="Confidence level")
    key_contributions: List[str] = Field(description="Key points made")
    conflicts_with_previous: bool = Field(description="Conflicts with earlier responses")
    should_continue_discussion: bool = Field(description="Whether more discussion is needed")


class MergeStrategy(str, Enum):
    """Strategy for synthesizing final response"""
    PRIORITIZE_LEAD = "prioritize_lead"
    COMBINE_BEST = "combine_best"
    CONSENSUS = "consensus"


class SynthesisSection(BaseModel):
    """Section to include in synthesis"""
    source_model: str = Field(description="Model ID to source from")
    content_type: str = Field(description="Type of content (e.g., 'code', 'explanation', 'analysis')")
    priority: int = Field(description="Order priority (lower = earlier)", ge=1)


class SynthesisResult(BaseModel):
    """Structured output for synthesis plan"""
    primary_source_model: str = Field(description="Model to prioritize")
    source_weights: Dict[str, float] = Field(description="Weight per model in synthesis")
    merge_strategy: MergeStrategy = Field(description="How to merge responses")
    sections_to_include: List[SynthesisSection] = Field(description="Sections to include in order")
    final_confidence: float = Field(description="Overall confidence (0-1)", ge=0, le=1)
    synthesis_instructions: str = Field(description="Instructions for generating final response")


class TokenUsage(BaseModel):
    """Token usage statistics from an API call"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class GitHubModelsOrchestrator:
    """
    Orchestrator using GPT-5-nano via GitHub Models API

    Provides minimal, structured API calls for:
    - Query analysis and domain classification
    - Turn-by-turn evaluation
    - Final response synthesis
    """

    def __init__(
        self,
        github_token: Optional[str] = None,
        openrouter_key: Optional[str] = None,
        model_id: Optional[str] = None,
        api_url: str = None,
        max_tokens: int = 16384
    ):
        """
        Initialize orchestrator with API credentials

        Args:
            github_token: GitHub Personal Access Token (user_models:read permission)
            openrouter_key: OpenRouter API key
            model_id: Model to use (env: ORCHESTRATOR_MODEL, default: gpt-4o)
            api_url: GitHub Models API endpoint (defaults to constant)
            max_tokens: Maximum tokens per response (includes reasoning tokens for GPT-5 models)
        """
        default_env_token = (
            os.getenv("GH_MODELS_TOKEN")
            or os.getenv("GITHUB_TOKEN")
            or os.getenv("GH_TOKEN")
        )
        self.github_token = github_token or default_env_token
        self.openrouter_key = openrouter_key or os.getenv("OPENROUTER_API_KEY")
        self._default_env_token = default_env_token
        self.model_id = model_id or os.getenv("ORCHESTRATOR_MODEL", "gpt-4o")
        self.api_url = api_url or GITHUB_MODELS_API_URL
        self.max_tokens = max_tokens

        # Initialize unified model client
        from clients.model_client import ModelClient
        self.client = ModelClient(self.github_token, self.openrouter_key)

        if not self.github_token:
            raise ValueError(
                "GitHub token required. Set GH_MODELS_TOKEN (or GITHUB_TOKEN/GH_TOKEN) env var or pass github_token parameter."
            )

    async def _call_structured(
        self,
        prompt: str,
        response_format: Type[BaseModel]
    ) -> tuple[BaseModel, TokenUsage]:
        """
        Make structured output call to GPT-5-nano

        Args:
            prompt: System + user prompt
            response_format: Pydantic model for response validation

        Returns:
            Tuple of (Validated Pydantic model instance, TokenUsage)
        """
        # Add JSON schema instruction to prompt
        schema = response_format.schema()

        # Extract just the property names and types for clearer instruction
        properties = schema.get("properties", {})
        fields_description = "\n".join([
            f"- {name}: {prop.get('description', prop.get('type', 'any'))}"
            for name, prop in properties.items()
        ])

        structured_prompt = f"""{prompt}

IMPORTANT: Respond with a JSON object containing these fields:
{fields_description}

Example format (fill in actual values based on your analysis):
{{
{', '.join([f'  "{name}": <your value>' for name in properties.keys()])}
}}

Respond with ONLY the JSON object. Do not include the schema definition, explanations, or any text outside the JSON."""

        combined_prompt = f"IMPORTANT: Respond with valid JSON only, no other text.\n\n{structured_prompt}"
        messages = [{"role": "user", "content": combined_prompt}]
        
        # Use ModelClient to make the call
        # We try to use response_format={"type": "json_object"} if supported, but we also rely on prompt
        try:
            result = await self.client.call_model(
                self.model_id,
                messages,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}
            )
            
            content = result["content"]
            usage = result.get("usage", {})
            
            # Parse JSON
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                # Try simple cleanup if markdown blocks are present
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                    data = json.loads(content)
                else:
                    raise

            # Normalize domain aliases before validation
            if "query_domains" in data and isinstance(data["query_domains"], list):
                data["query_domains"] = [
                    DOMAIN_ALIASES.get(d, d) for d in data["query_domains"]
                ]
            if "domain_weights" in data and isinstance(data["domain_weights"], dict):
                data["domain_weights"] = {
                    DOMAIN_ALIASES.get(k, k): v for k, v in data["domain_weights"].items()
                }

            # Validate against Pydantic model
            validated_obj = response_format(**data)
            
            # Create TokenUsage
            token_usage = TokenUsage(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0)
            )
            
            return validated_obj, token_usage

        except Exception as e:
            logger.error(f"Orchestrator error: {e}")
            raise


    async def analyze_query(self, query: str, model_profiles: Dict[str, Dict]) -> tuple[QueryAnalysis, TokenUsage]:
        """
        Analyze user query and determine discussion parameters

        Args:
            query: User's question/request
            model_profiles: Dict of model capabilities

        Returns:
            Tuple of (QueryAnalysis with domain classification and model scores, TokenUsage)
        """
        # Build model capabilities summary (limit to top 5 domains per model for conciseness)
        capabilities_summary = "\n".join([
            f"- {model_id}: {', '.join([f'{domain}({score:.2f})' for domain, score in sorted(profile['expertise_domains'].items(), key=lambda x: x[1], reverse=True)[:5]])}"
            for model_id, profile in model_profiles.items()
        ])

        prompt = f"""Analyze this user query and determine the optimal discussion strategy.

User Query: {query}

Available Models and Their Expertise:
{capabilities_summary}

Determine:
1. What domains this query requires (mathematics, coding, reasoning, creative_writing, conversation, summarization, scientific_knowledge, common_sense)
2. How much weight each domain should have (must sum to 1.0)
3. Expertise score for each model on THIS specific query (0-1 based on domain match)
4. Which model should lead the discussion (highest expertise)
5. How many discussion rounds are needed (2-4):
   - 2 rounds: Simple to moderate query, lead model plus one supporting perspective
   - 3 rounds: Complex multi-domain query, need multiple perspectives
   - 4 rounds: Very complex, requires extensive collaboration
   NOTE: Always use at least 2 rounds to enable multi-model collaboration.

Provide brief reasoning for your analysis."""

        return await self._call_structured(prompt, QueryAnalysis)

    async def evaluate_turn(
        self,
        model_id: str,
        model_response: str,
        query: str,
        context: List[Dict[str, Any]],
        expertise_score: float
    ) -> tuple[TurnEvaluation, TokenUsage]:
        """
        Evaluate a model's contribution to the discussion

        Args:
            model_id: ID of model being evaluated
            model_response: The model's response text
            query: Original user query
            context: Previous model responses in the discussion
            expertise_score: Model's expertise score for this query

        Returns:
            Tuple of (TurnEvaluation with quality metrics, TokenUsage)
        """
        # Build context summary
        context_summary = "\n\n".join([
            f"Turn {i+1} - {turn['model']}:\n{turn['response'][:500]}..."
            for i, turn in enumerate(context)
        ]) if context else "No previous responses"

        prompt = f"""Evaluate this model's contribution to an ongoing discussion.

Original Query: {query}

Model: {model_id}
Expected Expertise Score: {expertise_score:.2f}

Previous Discussion:
{context_summary}

Current Response:
{model_response}

Evaluate:
1. Quality score (0-1): Overall quality of response
2. Relevance score (0-1): How well it addresses the query
3. Expertise alignment (0-1): How well it leveraged its strengths
4. Confidence level: high/medium/low based on response certainty
5. Key contributions: List 2-4 specific points this model contributed
6. Conflicts: Does it contradict previous responses?
7. Should continue: Does the discussion need more input?

Consider:
- Is this response adding new value or just repeating others?
- Is it staying within its expertise area?
- Are there gaps remaining that other models could fill?"""

        return await self._call_structured(prompt, TurnEvaluation)

    async def synthesize_final(
        self,
        query: str,
        discussion_turns: List[Dict[str, Any]],
        evaluations: List[TurnEvaluation],
        model_profiles: Dict[str, Dict]
    ) -> tuple[SynthesisResult, TokenUsage]:
        """
        Create synthesis plan for final response

        Args:
            query: Original user query
            discussion_turns: All model responses
            evaluations: Evaluations for each turn
            model_profiles: Model capability profiles

        Returns:
            Tuple of (SynthesisResult with merge strategy, TokenUsage)
        """
        # Build discussion summary
        discussion_summary = "\n\n".join([
            f"""Model: {turn['model']}
Response: {turn['response'][:300]}...
Evaluation: Quality={eval.quality_score:.2f}, Relevance={eval.relevance_score:.2f}, Expertise={eval.expertise_alignment:.2f}
Key Points: {', '.join(eval.key_contributions[:3])}"""
            for turn, eval in zip(discussion_turns, evaluations)
        ])

        prompt = f"""Create a synthesis plan to combine model responses into one optimal answer.

Original Query: {query}

Discussion Summary:
{discussion_summary}

Create a synthesis plan with these exact fields:
1. primary_source_model: The model ID to prioritize (e.g., "phi-3-mini", "qwen3-4b")
2. source_weights: Dictionary mapping each model ID to its weight, e.g., {{"phi-3-mini": 0.7, "qwen3-4b": 0.3}}
3. merge_strategy: One of "prioritize_lead", "combine_best", or "consensus"
4. sections_to_include: Array of sections, each with:
   - source_model: Model ID to source from (e.g., "phi-3-mini")
   - content_type: Type like "code", "explanation", "analysis"
   - priority: Integer order (1=first, 2=second)
5. final_confidence: Overall confidence 0-1
6. synthesis_instructions: How to generate the final response

IMPORTANT: Use actual model IDs from the discussion (e.g., "phi-3-mini", "qwen3-4b", "llama-3.2-3b"), not generic names."""

        return await self._call_structured(prompt, SynthesisResult)

    async def check_rate_limits(self) -> Dict[str, Any]:
        """
        Check current rate limit status

        Returns:
            Dict with limit, remaining, and reset information
        """
        from clients.http_client import HTTPClient
        import httpx
        
        client = HTTPClient.get_client()
        
        # Make minimal request to check headers
        payload = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": "ping"}],
            "max_completion_tokens": 1,
            "stream": False
        }

        try:
            response = await client.post(
                self.api_url,
                headers=self._get_headers(),
                json=payload
            )
            return {
                "limit": response.headers.get("x-ratelimit-limit"),
                "remaining": response.headers.get("x-ratelimit-remaining"),
                "reset": response.headers.get("x-ratelimit-reset"),
                "status": "ok" if response.is_success else f"error_{response.status_code}"
            }
        except Exception as e:
             return {"status": "error", "details": str(e)}
