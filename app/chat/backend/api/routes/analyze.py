"""
Analyze mode API routes
"""

from typing import Optional, List
from fastapi import APIRouter
from pydantic import BaseModel

from services.streaming import create_sse_response, stream_engine_events
from engines.analyze import AnalyzeEngine

router = APIRouter(prefix="/api/chat/analyze", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    """Request body for analyze mode"""
    query: str
    participants: List[str]
    max_tokens: int = 1024
    github_token: Optional[str] = None
    openrouter_key: Optional[str] = None
    system_prompt: Optional[str] = None


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
        stream_engine_events(
            engine_class=AnalyzeEngine,
            run_method="run_analyze",
            participants=request.participants,
            run_kwargs={
                "query": request.query,
                "max_tokens": request.max_tokens,
                "system_prompt": request.system_prompt,
            },
            github_token=request.github_token,
            openrouter_key=request.openrouter_key,
        )
    )
