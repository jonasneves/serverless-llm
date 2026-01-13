"""
Debate mode API routes
"""

from typing import Optional, List
from fastapi import APIRouter

from api.models import DiscussionRequest
from services.streaming import create_sse_response, stream_engine_events
from engines.debate import DebateEngine

router = APIRouter(prefix="/api/chat/debate", tags=["debate"])


@router.post("/stream")
async def debate_stream(request: DiscussionRequest):
    """
    Stream turn-based debate using Server-Sent Events

    Models take turns responding, with each seeing all previous responses.
    No orchestrator - simple sequential discussion.
    """
    return create_sse_response(
        stream_engine_events(
            engine_class=DebateEngine,
            run_method="run_debate",
            participants=request.participants,
            run_kwargs={
                "query": request.query,
                "rounds": request.turns,  # Reuse 'turns' field as 'rounds'
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "system_prompt": request.system_prompt,
            },
            github_token=request.github_token,
            openrouter_key=request.openrouter_key,
        )
    )
