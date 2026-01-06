"""
Debate mode API routes
"""

import json
import logging
from typing import Optional, List, AsyncGenerator
from fastapi import APIRouter

from api.models import DiscussionRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/debate", tags=["debate"])


async def stream_debate_events(
    query: str,
    max_tokens: int,
    temperature: float,
    github_token: Optional[str],
    openrouter_key: Optional[str],
    rounds: int,
    participants: Optional[List[str]]
) -> AsyncGenerator[str, None]:
    """
    Stream debate events as Server-Sent Events

    Events:
    - debate_start: Debate begins
    - round_start: New round begins
    - turn_start: Model begins responding
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished
    - round_complete: Round finished
    - debate_complete: Full debate finished
    - error: Error occurred
    """
    try:
        from engines.debate import DebateEngine
        from core.config import MODEL_ENDPOINTS

        if not participants:
            yield f"data: {json.dumps({'event': 'error', 'error': 'No participants selected'})}\n\n"
            return

        # Initialize debate engine
        engine = DebateEngine(
            model_endpoints=MODEL_ENDPOINTS,
            github_token=github_token,
            openrouter_key=openrouter_key
        )

        # Run debate
        async for event in engine.run_debate(
            query=query,
            participants=participants,
            rounds=rounds,
            max_tokens=max_tokens,
            temperature=temperature
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Debate error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def debate_stream(request: DiscussionRequest):
    """
    Stream turn-based debate using Server-Sent Events

    Models take turns responding, with each seeing all previous responses.
    No orchestrator - simple sequential discussion.
    """
    return create_sse_response(
        stream_debate_events(
            query=request.query,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            github_token=request.github_token,
            openrouter_key=request.openrouter_key,
            rounds=request.turns,  # Reuse 'turns' field as 'rounds'
            participants=request.participants
        )
    )
