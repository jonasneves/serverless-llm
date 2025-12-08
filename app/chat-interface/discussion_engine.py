"""
Discussion Engine - Multi-Model Collaborative Discussion

Orchestrates turn-based discussions between models with real-time streaming.
Models "think out loud together" with orchestrator guidance.
"""

import asyncio
import json
from typing import Dict, List, Any, AsyncGenerator, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

from orchestrator import GitHubModelsOrchestrator, QueryAnalysis, TurnEvaluation, SynthesisResult, TokenUsage
from model_profiles import MODEL_PROFILES, rank_models_for_query


@dataclass
class DiscussionTurn:
    """Represents one model's contribution to the discussion"""
    turn_number: int
    model_id: str
    model_name: str
    prompt: str
    response: str
    response_time_ms: int
    evaluation: Optional[Dict[str, Any]] = None
    timestamp: str = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()


@dataclass
class DiscussionState:
    """Complete state of a discussion session"""
    discussion_id: str
    query: str
    analysis: Optional[Dict[str, Any]] = None
    turns: List[DiscussionTurn] = None
    synthesis: Optional[Dict[str, Any]] = None
    status: str = "initializing"  # initializing, analyzing, discussing, synthesizing, complete, error
    error: Optional[str] = None
    started_at: str = None
    completed_at: Optional[str] = None

    def __post_init__(self):
        if self.turns is None:
            self.turns = []
        if self.started_at is None:
            self.started_at = datetime.utcnow().isoformat()


class DiscussionEngine:
    """
    Manages multi-model discussions with orchestrator guidance

    Flow:
    1. Orchestrator analyzes query → determines lead model, domain weights, expected turns
    2. Turn 1: Lead model responds with domain context
    3. Turn 2+: Supporting models respond with full discussion context
    4. After each turn: Orchestrator evaluates contribution
    5. Synthesis: Orchestrator plans merge, engine generates final response
    """

    def __init__(
        self,
        orchestrator: GitHubModelsOrchestrator,
        model_endpoints: Dict[str, str],
        timeout_per_turn: int = 30
    ):
        """
        Initialize discussion engine

        Args:
            orchestrator: Initialized GitHubModelsOrchestrator
            model_endpoints: Dict mapping model_id -> API URL
            timeout_per_turn: Max seconds per model response
        """
        self.orchestrator = orchestrator
        self.model_endpoints = model_endpoints
        self.timeout_per_turn = timeout_per_turn

    def is_api_model(self, model_id: str) -> bool:
        """Check if a model is an API model (uses GitHub Models API)"""
        profile = MODEL_PROFILES.get(model_id)
        return profile is not None and profile.get("model_type") == "api"

    def _build_turn_prompt(
        self,
        query: str,
        model_id: str,
        turn_number: int,
        analysis: QueryAnalysis,
        previous_turns: List[DiscussionTurn]
    ) -> str:
        """
        Build context-aware prompt for a model's turn

        Args:
            query: Original user query
            model_id: Model responding this turn
            turn_number: Current turn number (0-indexed)
            analysis: Orchestrator's query analysis
            previous_turns: All previous discussion turns

        Returns:
            Prompt string with appropriate context
        """
        profile = MODEL_PROFILES[model_id]
        my_name = profile["display_name"]
        expertise_score = analysis.model_expertise_scores[model_id]
        strengths = ", ".join(profile["primary_strengths"])

        # Get all participant names for roundtable context
        all_participants = [
            MODEL_PROFILES[mid]["display_name"]
            for mid in analysis.model_expertise_scores.keys()
            if mid in MODEL_PROFILES
        ]
        other_participants = [name for name in all_participants if name != my_name]
        participants_list = ", ".join(other_participants)

        if turn_number == 0:
            # Lead model - initial response with domain awareness
            domain_context = ", ".join([
                f"{domain} ({weight:.0%})"
                for domain, weight in sorted(
                    analysis.domain_weights.items(),
                    key=lambda x: x[1],
                    reverse=True
                )
            ])

            return f"""You are {my_name}, participating in a Model Roundtable discussion.

You are seated at a virtual roundtable with other AI models: {participants_list}. You have been selected to LEAD this discussion and speak first based on your expertise in this topic.

Your strengths: {strengths}
Your expertise score for this query: {expertise_score:.2f} out of 1.0
Query domains: {domain_context}

User Query:
{query}

As the discussion leader, provide your analysis and response. Show your work step by step, especially for:
- Counting tasks: list each item explicitly
- Math problems: show each calculation
- Logical reasoning: explain each step

Be thorough and precise - {participants_list} will review and critique your response next."""

        else:
            # Supporting models - respond with full context including evaluations
            previous_context_parts = []
            for turn in previous_turns:
                turn_text = f"**{turn.model_name}**:\n{turn.response}"
                # Add evaluation scores if available
                if turn.evaluation:
                    eval_data = turn.evaluation
                    quality = eval_data.get('quality_score', 0)
                    relevance = eval_data.get('relevance_score', 0)
                    confidence = eval_data.get('confidence_assessment', 'unknown')
                    turn_text += f"\n[Evaluation: Quality {quality:.0%}, Relevance {relevance:.0%}, Confidence: {confidence}]"
                previous_context_parts.append(turn_text)

            previous_context = "\n\n".join(previous_context_parts)

            # Get names of models who have already spoken
            spoken_models = list(set(turn.model_name for turn in previous_turns))
            spoken_list = ", ".join(spoken_models)

            # Get the lead model's display name
            lead_model_name = MODEL_PROFILES.get(analysis.discussion_lead, {}).get("display_name", analysis.discussion_lead)

            return f"""You are {my_name}, participating in a Model Roundtable discussion.

You are seated at a virtual roundtable with: {participants_list}. The designated discussion lead is **{lead_model_name}** (selected for highest expertise on this query). So far, {spoken_list} ha{"ve" if len(spoken_models) > 1 else "s"} shared their perspectives.

Your strengths: {strengths}
Your expertise score for this query: {expertise_score:.2f} out of 1.0

Original User Query:
{query}

Discussion so far:
{previous_context}

---

Now it's your turn to contribute. CRITICALLY EVALUATE what others have said:

1. **VERIFY**: Check accuracy of claims and calculations. If {spoken_models[0] if spoken_models else "another model"} made an error, call it out by name.
2. **CHALLENGE**: If you disagree with conclusions, explain why. Reference specific models (e.g., "I disagree with {spoken_models[0] if spoken_models else "the previous response"} because...").
3. **IMPROVE**: Offer corrections or alternative approaches.
4. **CONFIRM**: If you agree, explain why you're confident.

Be direct and specific. Refer to other models by name when agreeing or disagreeing. If counting items, do it yourself step by step."""

    async def _call_model_api(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream response from a model's API

        Args:
            model_id: Model identifier
            messages: OpenAI-format messages
            max_tokens: Max tokens to generate
            temperature: Sampling temperature

        Yields:
            Dicts with type "chunk" (content) or "usage" (token counts)
        """
        from http_client import HTTPClient
        import httpx

        endpoint = self.model_endpoints.get(model_id)
        if not endpoint:
            raise ValueError(f"No endpoint configured for model: {model_id}")

        url = f"{endpoint}/v1/chat/completions"
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True
        }

        client = HTTPClient.get_client()
        
        try:
            async with client.stream("POST", url, json=payload, timeout=self.timeout_per_turn) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    raise Exception(f"Model API error {response.status_code} for {model_id}: {error_text.decode('utf-8')}")

                async for line in response.aiter_lines():
                    if not line or not line.startswith('data: '):
                        continue

                    data = line[6:]  # Remove 'data: ' prefix
                    if data == '[DONE]':
                        break

                    try:
                        chunk = json.loads(data)

                        # Check for usage data (usually in final chunk)
                        if 'usage' in chunk:
                            usage = chunk['usage']
                            if 'prompt_tokens' not in usage or 'completion_tokens' not in usage or 'total_tokens' not in usage:
                                raise ValueError("Incomplete usage data received from model")
                            yield {
                                "type": "usage",
                                "prompt_tokens": usage['prompt_tokens'],
                                "completion_tokens": usage['completion_tokens'],
                                "total_tokens": usage['total_tokens']
                            }

                        # Check for content chunk
                        content = chunk.get('choices', [{}])[0].get('delta', {}).get('content')
                        if content:
                            yield {"type": "chunk", "content": content}
                    except json.JSONDecodeError:
                        continue
        except httpx.HTTPError as e:
             raise Exception(f"Connection error to {model_id}: {str(e)}")

    async def _call_github_models_api(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream response from GitHub Models API for API model participants

        Args:
            model_id: Model identifier (e.g., 'gpt-4o', 'llama-3.3-70b-instruct')
            messages: OpenAI-format messages
            max_tokens: Max tokens to generate
            temperature: Sampling temperature

        Yields:
            Dicts with type "chunk" (content) or "usage" (token counts)
        """
        from http_client import HTTPClient
        import httpx

        url = "https://models.github.ai/inference/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.orchestrator.github_token}",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        payload = {
            "model": model_id,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True
        }

        client = HTTPClient.get_client()

        try:
            async with client.stream("POST", url, headers=headers, json=payload, timeout=self.timeout_per_turn) as response:
                if response.status_code == 429:
                    rate_limit_reset = response.headers.get("x-ratelimit-reset")
                    raise Exception(f"Rate limit exceeded for {model_id}. Reset at: {rate_limit_reset}")

                if response.status_code != 200:
                    error_text = await response.aread()
                    raise Exception(f"GitHub Models API error {response.status_code} for {model_id}: {error_text.decode('utf-8')}")

                async for line in response.aiter_lines():
                    if not line or not line.startswith('data: '):
                        continue

                    data = line[6:]  # Remove 'data: ' prefix
                    if data == '[DONE]':
                        break

                    try:
                        chunk = json.loads(data)

                        # Check for usage data (usually in final chunk)
                        if 'usage' in chunk:
                            usage = chunk['usage']
                            if 'prompt_tokens' not in usage or 'completion_tokens' not in usage or 'total_tokens' not in usage:
                                raise ValueError("Incomplete usage data received from model")
                            yield {
                                "type": "usage",
                                "prompt_tokens": usage['prompt_tokens'],
                                "completion_tokens": usage['completion_tokens'],
                                "total_tokens": usage['total_tokens']
                            }

                        # Check for content chunk
                        content = chunk.get('choices', [{}])[0].get('delta', {}).get('content')
                        if content:
                            yield {"type": "chunk", "content": content}
                    except json.JSONDecodeError:
                        continue
        except httpx.HTTPError as e:
             raise Exception(f"Connection error to {model_id}: {str(e)}")

    async def _execute_turn(
        self,
        query: str,
        model_id: str,
        turn_number: int,
        analysis: QueryAnalysis,
        previous_turns: List[DiscussionTurn],
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute one model's turn with streaming

        Args:
            query: User query
            model_id: Model to run
            turn_number: Current turn
            analysis: Query analysis
            previous_turns: Previous turns
            max_tokens: Max generation tokens
            temperature: Sampling temperature

        Yields:
            Events: turn_start, turn_chunk, turn_complete
        """
        profile = MODEL_PROFILES[model_id]
        prompt = self._build_turn_prompt(query, model_id, turn_number, analysis, previous_turns)

        # Yield turn start
        yield {
            "type": "turn_start",
            "turn_number": turn_number,
            "model_id": model_id,
            "model_name": profile["display_name"],
            "expertise_score": analysis.model_expertise_scores[model_id]
        }

        # Stream response
        full_response = ""
        local_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        start_time = asyncio.get_event_loop().time()

        try:
            messages = [{"role": "user", "content": prompt}]
            # Choose API method based on model type
            if self.is_api_model(model_id):
                api_generator = self._call_github_models_api(model_id, messages, max_tokens, temperature)
            else:
                api_generator = self._call_model_api(model_id, messages, max_tokens, temperature)

            async for item in api_generator:
                if item["type"] == "chunk":
                    full_response += item["content"]
                    yield {
                        "type": "turn_chunk",
                        "model_id": model_id,
                        "chunk": item["content"]
                    }
                elif item["type"] == "usage":
                    local_usage = {
                        "prompt_tokens": item["prompt_tokens"],
                        "completion_tokens": item["completion_tokens"],
                        "total_tokens": item["total_tokens"]
                    }

        except asyncio.TimeoutError:
            yield {
                "type": "turn_error",
                "model_id": model_id,
                "error": f"Timeout after {self.timeout_per_turn}s"
            }
            return
        except Exception as e:
            yield {
                "type": "turn_error",
                "model_id": model_id,
                "error": str(e)
            }
            return

        response_time_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)

        # Evaluate turn (orchestrator call)
        try:
            evaluation, eval_usage = await self.orchestrator.evaluate_turn(
                model_id=model_id,
                model_response=full_response,
                query=query,
                context=[{
                    "model": t.model_id,
                    "response": t.response
                } for t in previous_turns],
                expertise_score=analysis.model_expertise_scores[model_id]
            )

            turn = DiscussionTurn(
                turn_number=turn_number,
                model_id=model_id,
                model_name=profile["display_name"],
                prompt=prompt,
                response=full_response,
                response_time_ms=response_time_ms,
                evaluation=evaluation.dict()
            )

            yield {
                "type": "turn_complete",
                "turn": asdict(turn),
                "evaluation": evaluation.dict(),
                "orchestrator_usage": {
                    "prompt_tokens": eval_usage.prompt_tokens,
                    "completion_tokens": eval_usage.completion_tokens,
                    "total_tokens": eval_usage.total_tokens
                },
                "local_model_usage": local_usage
            }

        except Exception as e:
            # If evaluation fails, still complete turn without evaluation
            turn = DiscussionTurn(
                turn_number=turn_number,
                model_id=model_id,
                model_name=profile["display_name"],
                prompt=prompt,
                response=full_response,
                response_time_ms=response_time_ms
            )

            yield {
                "type": "turn_complete",
                "turn": asdict(turn),
                "evaluation": None,
                "evaluation_error": str(e),
                "local_model_usage": local_usage
            }

    async def run_discussion(
        self,
        query: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        turns: int = 2,
        participants: Optional[List[str]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run complete discussion with streaming events

        Args:
            query: User's question/request
            max_tokens: Max tokens per model response
            temperature: Sampling temperature

        Yields:
            Stream of events:
            - analysis_start
            - analysis_complete: QueryAnalysis result
            - turn_start: Model begins response
            - turn_chunk: Streaming response chunk
            - turn_complete: Turn finished with evaluation
            - synthesis_start
            - synthesis_complete: Final synthesis plan
            - discussion_complete
            - error: If something goes wrong
        """
        try:
            # Track orchestrator token usage
            orchestrator_tokens = {"prompt": 0, "completion": 0, "total": 0, "calls": 0}
            # Track local model token usage
            local_model_tokens = {"prompt": 0, "completion": 0, "total": 0}

            # Phase 1: Orchestrator analyzes query
            yield {"type": "analysis_start"}

            analysis, usage = await self.orchestrator.analyze_query(query, MODEL_PROFILES)
            orchestrator_tokens["prompt"] += usage.prompt_tokens
            orchestrator_tokens["completion"] += usage.completion_tokens
            orchestrator_tokens["total"] += usage.total_tokens
            orchestrator_tokens["calls"] += 1

            yield {
                "type": "analysis_complete",
                "analysis": analysis.dict()
            }

            # Phase 2: Discussion turns
            completed_turns = []
            evaluations = []

            # Determine participating models
            if participants:
                # Use user-selected participants, ordered by expertise
                # Include both local models (with endpoints) and API models
                available_participants = [
                    p for p in participants
                    if p in self.model_endpoints or self.is_api_model(p)
                ]
                ranked = rank_models_for_query(analysis.domain_weights)
                ranked_ids = [model_id for model_id, score in ranked]
                # Sort selected participants by their expertise ranking
                participating_models = sorted(
                    available_participants,
                    key=lambda x: ranked_ids.index(x) if x in ranked_ids else 999
                )
            else:
                # Default: all local models, ranked by expertise
                all_models = list(self.model_endpoints.keys())
                ranked = rank_models_for_query(analysis.domain_weights)
                participating_models = [analysis.discussion_lead] + [
                    model_id for model_id, score in ranked
                    if model_id != analysis.discussion_lead and model_id in all_models
                ]

            # Use user-specified turns, all models participate each turn
            for turn_num in range(turns):

                # Execute turn for each participating model
                for model_id in participating_models:
                    async for event in self._execute_turn(
                        query=query,
                        model_id=model_id,
                        turn_number=turn_num,
                        analysis=analysis,
                        previous_turns=completed_turns,
                        max_tokens=max_tokens,
                        temperature=temperature
                    ):
                        yield event

                        # Track completed turns
                        if event["type"] == "turn_complete":
                            turn = DiscussionTurn(**event["turn"])
                            completed_turns.append(turn)

                            # Accumulate orchestrator usage from evaluation
                            if event.get("orchestrator_usage"):
                                usage = event["orchestrator_usage"]
                                required_fields = ["prompt_tokens", "completion_tokens", "total_tokens"]
                                missing_fields = [f for f in required_fields if f not in usage]
                                if missing_fields:
                                    raise ValueError(f"Missing orchestrator usage fields: {missing_fields}")
                                orchestrator_tokens["prompt"] += usage["prompt_tokens"]
                                orchestrator_tokens["completion"] += usage["completion_tokens"]
                                orchestrator_tokens["total"] += usage["total_tokens"]
                                orchestrator_tokens["calls"] += 1

                            # Accumulate local model usage
                            if event.get("local_model_usage"):
                                usage = event["local_model_usage"]
                                required_fields = ["prompt_tokens", "completion_tokens", "total_tokens"]
                                missing_fields = [f for f in required_fields if f not in usage]
                                if missing_fields:
                                    raise ValueError(f"Missing local model usage fields: {missing_fields}")
                                local_model_tokens["prompt"] += usage["prompt_tokens"]
                                local_model_tokens["completion"] += usage["completion_tokens"]
                                local_model_tokens["total"] += usage["total_tokens"]

                            if event.get("evaluation"):
                                evaluation = TurnEvaluation(**event["evaluation"])
                                evaluations.append(evaluation)

                                # Check if discussion should continue
                                if not evaluation.should_continue_discussion:
                                    yield {
                                        "type": "discussion_early_termination",
                                        "reason": "Orchestrator determined discussion is complete"
                                    }
                                    turn_num = analysis.expected_turns  # Break outer loop
                                    break

            # Phase 3: Synthesis
            yield {"type": "synthesis_start"}

            synthesis, synth_usage = await self.orchestrator.synthesize_final(
                query=query,
                discussion_turns=[{
                    "model": t.model_id,
                    "response": t.response
                } for t in completed_turns],
                evaluations=evaluations,
                model_profiles=MODEL_PROFILES
            )
            orchestrator_tokens["prompt"] += synth_usage.prompt_tokens
            orchestrator_tokens["completion"] += synth_usage.completion_tokens
            orchestrator_tokens["total"] += synth_usage.total_tokens
            orchestrator_tokens["calls"] += 1

            yield {
                "type": "synthesis_complete",
                "synthesis": synthesis.dict(),
                "total_turns": len(completed_turns)
            }

            # Generate final synthesized response based on synthesis plan
            final_response = self._generate_synthesis_text(
                completed_turns=completed_turns,
                synthesis=synthesis
            )

            yield {
                "type": "discussion_complete",
                "final_response": final_response,
                "synthesis": synthesis.dict(),
                "discussion_summary": {
                    "total_turns": len(completed_turns),
                    "participating_models": list(set(t.model_id for t in completed_turns)),
                    "total_time_ms": sum(t.response_time_ms for t in completed_turns)
                },
                "token_usage": {
                    "orchestrator": orchestrator_tokens,
                    "local_models": local_model_tokens
                }
            }

        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "error_type": type(e).__name__
            }

    def _generate_synthesis_text(
        self,
        completed_turns: List[DiscussionTurn],
        synthesis: SynthesisResult
    ) -> str:
        """
        Generate final response text based on synthesis plan

        Args:
            completed_turns: All discussion turns
            synthesis: Orchestrator's synthesis plan

        Returns:
            Final synthesized response text
        """
        # Build response based on merge strategy
        if synthesis.merge_strategy == "prioritize_lead":
            # Mainly use primary source, add minor enhancements
            primary_turn = next(
                (t for t in completed_turns if t.model_id == synthesis.primary_source_model),
                completed_turns[0]
            )
            return primary_turn.response

        elif synthesis.merge_strategy == "combine_best":
            # Combine sections from each model based on synthesis plan
            sections = []

            # Sort sections by priority
            sorted_sections = sorted(
                synthesis.sections_to_include,
                key=lambda s: s.priority
            )

            for section in sorted_sections:
                turn = next(
                    (t for t in completed_turns if t.model_id == section.source_model),
                    None
                )
                if turn:
                    # Extract relevant part (for now, just include full response)
                    # TODO: More sophisticated section extraction
                    sections.append(f"**{section.content_type.title()}**:\n{turn.response}")

            return "\n\n".join(sections)

        else:  # consensus
            # Blend all responses, weighted by synthesis weights
            weighted_responses = []

            for model_id, weight in synthesis.source_weights.items():
                turn = next((t for t in completed_turns if t.model_id == model_id), None)
                if turn and weight > 0.1:  # Only include significant contributors
                    weighted_responses.append(
                        f"**{MODEL_PROFILES[model_id]['display_name']}** (weight: {weight:.0%}):\n{turn.response}"
                    )

            return "\n\n---\n\n".join(weighted_responses)
