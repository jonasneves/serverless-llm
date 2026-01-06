"""
Analyze mode API routes
"""

import json
import logging
from typing import Optional, List, AsyncGenerator
from fastapi import APIRouter
from pydantic import BaseModel

from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/analyze", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    """Request body for analyze mode"""
    query: str
    participants: List[str]
    max_tokens: int = 1024
    github_token: Optional[str] = None
    openrouter_key: Optional[str] = None


async def stream_analyze_events(
    query: str,
    max_tokens: int,
    github_token: Optional[str],
    openrouter_key: Optional[str],
    participants: List[str]
) -> AsyncGenerator[str, None]:
    """
    Stream analyze events as Server-Sent Events

    Events:
    - analyze_start: Analysis begins
    - model_start: Model begins responding
    - model_chunk: Streaming response content
    - model_response: Model response complete
    - analysis_complete: Analysis finished (consensus, divergence, unique)
    - analyze_complete: Full analysis finished
    - error: Error occurred
    """
    try:
        from engines.analyze import AnalyzeEngine
        from core.config import MODEL_ENDPOINTS

        if not participants:
            yield f"data: {json.dumps({'event': 'error', 'error': 'No participants selected'})}\n\n"
            return

        # Initialize analyze engine
        engine = AnalyzeEngine(
            model_endpoints=MODEL_ENDPOINTS,
            github_token=github_token,
            openrouter_key=openrouter_key
        )

        # Run analysis
        async for event in engine.run_analyze(
            query=query,
            participants=participants,
            max_tokens=max_tokens
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Analyze error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def analyze_stream(request: AnalyzeRequest):
    """
    Stream post-hoc analysis of multiple model responses

    Collects all responses, then analyzes to find:
    - Consensus: What models agree on
    - Divergence: Where they disagree
    - Unique contributions: What only specific models mentioned
    """
    return create_sse_response(
        stream_analyze_events(
            query=request.query,
            max_tokens=request.max_tokens,
            github_token=request.github_token,
            openrouter_key=request.openrouter_key,
            participants=request.participants
        )
    )
