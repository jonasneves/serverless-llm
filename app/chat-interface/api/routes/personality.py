"""
Personality mode API routes
"""

import json
import logging
from typing import List, Optional, AsyncGenerator
from fastapi import APIRouter

from api.models import PersonalityRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/personality", tags=["personality"])


async def stream_personality_events(
    query: str,
    participants: List[str],
    max_tokens: int,
    github_token: Optional[str]
) -> AsyncGenerator[str, None]:
    """
    Stream personality mode events as Server-Sent Events

    Events:
    - personality_start: Mode begins
    - model_start: Model begins generating persona
    - model_chunk: Streaming response content
    - model_response: Persona response complete
    - personality_complete: All personas finished
    - error: Error occurred
    """
    try:
        from personality_engine import PersonalityEngine
        from utils.github_token import get_default_github_token
        from core.config import MODEL_ENDPOINTS

        # Use user-provided token if available, otherwise use default
        token = github_token or get_default_github_token()

        engine = PersonalityEngine(
            model_endpoints=MODEL_ENDPOINTS,
            github_token=token
        )

        async for event in engine.run_personality_mode(
            query=query,
            participants=participants,
            max_tokens=max_tokens
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Personality mode error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def personality_stream(request: PersonalityRequest):
    """
    Stream personality mode responses using Server-Sent Events

    Each model generates a unique persona and responds to the query
    from that persona's perspective.
    """
    return create_sse_response(
        stream_personality_events(
            query=request.query,
            participants=request.participants,
            max_tokens=request.max_tokens,
            github_token=request.github_token
        )
    )
