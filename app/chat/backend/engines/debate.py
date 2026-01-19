"""
Debate Mode - Sequential Turn-Based Discussion

Models respond sequentially, with each model seeing all previous responses.
No orchestrator - simple turn-based conversation.

Flow:
1. Model A responds to query
2. Model B responds to query + sees A's response
3. Model C responds to query + sees A and B's responses
4. Continue for N rounds
"""

from typing import List, Dict, Any, AsyncGenerator, Optional
import asyncio
from dataclasses import dataclass
from datetime import datetime
from clients.model_profiles import MODEL_PROFILES, get_display_name
from prompts import DEBATE_TURN_SYSTEM
from .base import MultiModelEngine


@dataclass
class DebateTurn:
    """Represents one model's turn in the debate"""
    turn_number: int
    round_number: int
    model_id: str
    model_name: str
    response: str
    response_time_ms: int
    timestamp: str = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat()


class DebateEngine(MultiModelEngine):
    """Manages turn-based debates between models"""

    def __init__(
        self,
        model_endpoints: Dict[str, str],
        github_token: str = None,
        openrouter_key: str = None,
        timeout_per_turn: int = 30
    ):
        super().__init__(model_endpoints, github_token, openrouter_key, timeout_per_turn)
        self.timeout_per_turn = timeout_per_turn

    def _build_turn_prompt(
        self,
        query: str,
        model_id: str,
        previous_turns: List[DebateTurn],
        participant_ids: List[str]
    ) -> str:
        """
        Build context-aware prompt for a model's turn

        Args:
            query: Original user query
            model_id: Model responding this turn
            previous_turns: All previous turns in the debate
            participant_ids: All models participating

        Returns:
            Prompt string with appropriate context
        """
        profile = MODEL_PROFILES.get(model_id, {})
        my_name = profile.get("display_name", model_id)

        # Get other participant names
        other_names = [
            MODEL_PROFILES.get(pid, {}).get("display_name", pid)
            for pid in participant_ids if pid != model_id
        ]
        others_list = ", ".join(other_names) if other_names else "others"

        if not previous_turns:
            # First turn - just answer the question
            return f"""You are {my_name}, participating in a discussion with {others_list}.

User Query:
{query}

Provide your response to the query. Be concise and clear."""

        else:
            # Later turns - respond with context of previous discussion
            previous_context = "\n\n".join([
                f"**{turn.model_name}**:\n{turn.response}"
                for turn in previous_turns
            ])

            return f"""You are {my_name}, participating in a discussion with {others_list}.

Original User Query:
{query}

Discussion so far:
{previous_context}

Now it's your turn. You can:
- Build on previous responses
- Offer a different perspective
- Point out what others missed
- Synthesize the discussion

Provide your response:"""

    async def _execute_turn(
        self,
        query: str,
        model_id: str,
        turn_number: int,
        round_number: int,
        previous_turns: List[DebateTurn],
        participant_ids: List[str],
        max_tokens: int = 512,
        temperature: float = 0.7,
        system_prompt: str = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute one model's turn with streaming

        Args:
            query: User query
            model_id: Model to run
            turn_number: Overall turn number (0, 1, 2, ...)
            round_number: Which round this is (0, 1, 2, ...)
            previous_turns: Previous turns
            participant_ids: All participants
            max_tokens: Max generation tokens
            temperature: Sampling temperature
            system_prompt: Optional additional system prompt to prepend

        Yields:
            Events: turn_start, turn_chunk, turn_complete
        """
        profile = MODEL_PROFILES.get(model_id, {})
        model_name = profile.get("display_name", model_id)

        prompt = self._build_turn_prompt(query, model_id, previous_turns, participant_ids)

        yield {
            "type": "turn_start",
            "turn_number": turn_number,
            "round_number": round_number,
            "model_id": model_id,
            "model_name": model_name
        }

        full_response = ""
        start_time = asyncio.get_event_loop().time()

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "system", "content": DEBATE_TURN_SYSTEM})
            messages.append({"role": "user", "content": prompt})

            async for event in self.client.stream_model(model_id, messages, max_tokens, temperature):
                if event["type"] == "chunk":
                    full_response += event["content"]
                    yield {
                        "type": "turn_chunk",
                        "model_id": model_id,
                        "chunk": event["content"]
                    }
                elif event["type"] == "error":
                    raise Exception(event["error"])

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

        # Strip thinking tags from final response
        from prompts import strip_thinking_tags
        clean_response = strip_thinking_tags(full_response)

        turn = DebateTurn(
            turn_number=turn_number,
            round_number=round_number,
            model_id=model_id,
            model_name=model_name,
            response=clean_response,
            response_time_ms=response_time_ms
        )

        yield {
            "type": "turn_complete",
            "turn_number": turn_number,
            "round_number": round_number,
            "model_id": model_id,
            "model_name": model_name,
            "response": clean_response,
            "response_time_ms": response_time_ms
        }

    async def run_debate(
        self,
        query: str,
        participants: List[str],
        rounds: int = 2,
        max_tokens: int = 512,
        temperature: float = 0.7,
        system_prompt: str = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run complete debate with streaming events

        Args:
            query: User's question/request
            participants: List of model IDs to participate (in order)
            rounds: Number of rounds (each model speaks once per round)
            max_tokens: Max tokens per model response
            temperature: Sampling temperature
            system_prompt: Optional additional system prompt to prepend

        Yields:
            Stream of events:
            - debate_start
            - turn_start: Model begins response
            - turn_chunk: Streaming response chunk
            - turn_complete: Turn finished
            - round_complete: All models finished a round
            - debate_complete: Full debate finished
            - error: If something goes wrong
        """
        try:
            if not participants:
                yield {"type": "error", "error": "No participants selected"}
                return

            yield {
                "type": "debate_start",
                "participants": participants,
                "rounds": rounds
            }

            completed_turns = []
            turn_counter = 0

            # Run multiple rounds
            for round_num in range(rounds):
                yield {
                    "type": "round_start",
                    "round_number": round_num,
                    "total_rounds": rounds
                }

                # Each model takes a turn in sequence
                for model_id in participants:
                    async for event in self._execute_turn(
                        query=query,
                        model_id=model_id,
                        turn_number=turn_counter,
                        round_number=round_num,
                        previous_turns=completed_turns,
                        participant_ids=participants,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        system_prompt=system_prompt
                    ):
                        yield event

                        if event["type"] == "turn_complete":
                            turn = DebateTurn(
                                turn_number=turn_counter,
                                round_number=round_num,
                                model_id=event["model_id"],
                                model_name=event["model_name"],
                                response=event["response"],
                                response_time_ms=event["response_time_ms"]
                            )
                            completed_turns.append(turn)
                            turn_counter += 1

                yield {
                    "type": "round_complete",
                    "round_number": round_num,
                    "turns_in_round": len(participants)
                }

            yield {
                "type": "debate_complete",
                "total_turns": len(completed_turns),
                "total_rounds": rounds,
                "participating_models": participants,
                "total_time_ms": sum(t.response_time_ms for t in completed_turns)
            }

        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "error_type": type(e).__name__
            }
