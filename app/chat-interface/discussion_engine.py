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

from orchestrator import GitHubModelsOrchestrator, QueryAnalysis, TurnEvaluation, SynthesisResult
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
        expertise_score = analysis.model_expertise_scores[model_id]
        strengths = ", ".join(profile["primary_strengths"])

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

            return f"""You are participating in a collaborative discussion with other AI models.

You have been selected to LEAD this discussion based on your expertise.

Your strengths: {strengths}
Your expertise score for this query: {expertise_score:.2f} out of 1.0

Query domains: {domain_context}

User Query:
{query}

Provide your analysis and response. Focus on areas where you excel. Be thorough but concise - other models will build on your response in subsequent turns."""

        else:
            # Supporting models - respond with full context
            previous_context = "\n\n".join([
                f"**Turn {turn.turn_number + 1} - {turn.model_name}**:\n{turn.response}"
                for turn in previous_turns
            ])

            return f"""You are participating in a collaborative discussion with other AI models.

Your strengths: {strengths}
Your expertise score for this query: {expertise_score:.2f} out of 1.0

Original User Query:
{query}

Discussion so far:
{previous_context}

---

Add your perspective to this discussion. You can:
- Build on strong points from previous responses
- Offer alternative viewpoints in your areas of expertise
- Fill gaps or add details where others may have been brief
- Raise concerns or corrections if you notice issues

Focus on contributing what you do best. Keep your response focused and additive."""

    async def _call_model_api(
        self,
        model_id: str,
        messages: List[Dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> AsyncGenerator[str, None]:
        """
        Stream response from a model's API

        Args:
            model_id: Model identifier
            messages: OpenAI-format messages
            max_tokens: Max tokens to generate
            temperature: Sampling temperature

        Yields:
            Response chunks as they arrive
        """
        import aiohttp

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

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=self.timeout_per_turn)) as response:
                if not response.ok:
                    error_text = await response.text()
                    raise Exception(f"Model API error {response.status} for {model_id}: {error_text}")

                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    if not line or not line.startswith('data: '):
                        continue

                    data = line[6:]  # Remove 'data: ' prefix
                    if data == '[DONE]':
                        break

                    try:
                        chunk = json.loads(data)
                        content = chunk.get('choices', [{}])[0].get('delta', {}).get('content')
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue

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
        start_time = asyncio.get_event_loop().time()

        try:
            messages = [{"role": "user", "content": prompt}]
            async for chunk in self._call_model_api(model_id, messages, max_tokens, temperature):
                full_response += chunk
                yield {
                    "type": "turn_chunk",
                    "model_id": model_id,
                    "chunk": chunk
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
            evaluation = await self.orchestrator.evaluate_turn(
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
                "evaluation": evaluation.dict()
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
                "evaluation_error": str(e)
            }

    async def run_discussion(
        self,
        query: str,
        max_tokens: int = 512,
        temperature: float = 0.7
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
            # Phase 1: Orchestrator analyzes query
            yield {"type": "analysis_start"}

            analysis = await self.orchestrator.analyze_query(query, MODEL_PROFILES)

            yield {
                "type": "analysis_complete",
                "analysis": analysis.dict()
            }

            # Phase 2: Discussion turns
            completed_turns = []
            evaluations = []

            # Get all available local models
            all_models = list(self.model_endpoints.keys())

            for turn_num in range(analysis.expected_turns):
                # Determine which models participate this turn
                if turn_num == 0:
                    # Turn 1: Only lead model
                    participating_models = [analysis.discussion_lead]
                else:
                    # Turn 2+: All other models participate (ranked by expertise)
                    ranked = rank_models_for_query(analysis.domain_weights)
                    participating_models = [
                        model_id for model_id, score in ranked
                        if model_id != analysis.discussion_lead and model_id in all_models
                    ]

                    if not participating_models:
                        # No other models available
                        break

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

            synthesis = await self.orchestrator.synthesize_final(
                query=query,
                discussion_turns=[{
                    "model": t.model_id,
                    "response": t.response
                } for t in completed_turns],
                evaluations=evaluations,
                model_profiles=MODEL_PROFILES
            )

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
