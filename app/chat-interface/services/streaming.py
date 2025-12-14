"""
Shared streaming utilities for SSE (Server-Sent Events) responses
"""

from fastapi.responses import StreamingResponse
from typing import AsyncGenerator


def create_sse_response(event_generator: AsyncGenerator) -> StreamingResponse:
    """
    Create standardized SSE response with proper headers for all streaming endpoints.

    Args:
        event_generator: Async generator that yields event data

    Returns:
        StreamingResponse configured for Server-Sent Events
    """
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
