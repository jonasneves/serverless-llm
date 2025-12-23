"""
Council mode API routes
"""

import json
import logging
from typing import List, Optional, Dict, AsyncGenerator
from fastapi import APIRouter

from api.models import CouncilRequest
from services.streaming import create_sse_response
from utils.github_token import get_default_github_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/council", tags=["council"])


async def stream_council_events(
    query: str,
    participants: List[str],
    chairman_model: Optional[str],
    max_tokens: int,
    github_token: Optional[str],
    openrouter_key: Optional[str],
    completed_responses: Optional[Dict[str, str]],
    model_endpoints: Dict[str, str]
) -> AsyncGenerator[str, None]:
    """
    Stream council events as Server-Sent Events

    3-stage process:
    - Stage 1: All models respond independently (with streaming)
    - Stage 2: Models rank responses anonymously
    - Stage 3: Chairman synthesizes final answer
    """
    try:
        from engines.council import CouncilEngine

        # Get GitHub token
        token = github_token or get_default_github_token()
        if not token:
            yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for Council mode'})}\n\n"
            return

        # Initialize council engine
        engine = CouncilEngine(
            model_endpoints=model_endpoints,
            github_token=token,
            openrouter_key=openrouter_key,
            timeout=120
        )

        # Run council process with streaming
        async for event in engine.run_council(query, participants, chairman_model, max_tokens, completed_responses=completed_responses):
            # Normalize event name for clients (council_engine emits "type"; UI expects "event")
            if "event" not in event and "type" in event:
                event = {"event": event["type"], **event}
            yield f"data: {json.dumps(event)}\n\n"

    except Exception as e:
        logger.error(f"Council Error: {e}")
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def council_stream(request: CouncilRequest):
    """
    Stream LLM Council process using Server-Sent Events

    3-stage process:
    1. Stage 1: All models respond independently (parallel)
    2. Stage 2: Models rank responses anonymously
    3. Stage 3: Chairman synthesizes final answer

    Request body:
    - query: User's question or request
    - participants: List of model IDs to participate
    - chairman_model: Optional chairman model (defaults to first participant)
    - github_token: Optional user GitHub token

    Stream events:
    - stage1_start: Beginning of Stage 1
    - model_response: Individual model response
    - stage1_complete: Stage 1 finished
    - stage2_start: Beginning of Stage 2
    - ranking_response: Model's ranking of responses
    - stage2_complete: Stage 2 finished with aggregate rankings
    - stage3_start: Beginning of Stage 3
    - stage3_complete: Final synthesis ready
    - council_complete: Full council process finished
    - error: Error details
    """
    # Import MODEL_ENDPOINTS from core.config
    from core.config import MODEL_ENDPOINTS

    return create_sse_response(
        stream_council_events(
            query=request.query,
            participants=request.participants,
            chairman_model=request.chairman_model,
            max_tokens=request.max_tokens,
            github_token=request.github_token,
            openrouter_key=request.openrouter_key,
            completed_responses=request.completed_responses,
            model_endpoints=MODEL_ENDPOINTS
        )
    )
