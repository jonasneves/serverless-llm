"""
Special mode API routes (Verbalized Sampling and Confessions)
"""

import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter

from api.models import VerbalizedSamplingRequest, ConfessionRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["special"])


async def stream_verbalized_sampling_events(
    query: str,
    model: str,
    num_responses: int,
    temperature: float,
    max_tokens: int
) -> AsyncGenerator[str, None]:
    """
    Stream Verbalized Sampling events

    Uses the Stanford research technique to unlock LLM diversity by asking for
    a distribution of responses rather than a single response.
    """
    try:
        from chat_server import MODEL_ENDPOINTS, MODEL_DISPLAY_NAMES
        from verbalized_sampling_engine import VerbalizedSamplingEngine

        if model not in MODEL_ENDPOINTS:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Model {model} not found'}, ensure_ascii=False)}\n\n"
            return

        model_endpoint = MODEL_ENDPOINTS[model]
        model_name = MODEL_DISPLAY_NAMES.get(model, model)

        engine = VerbalizedSamplingEngine(model_endpoint, model_name)

        async for event in engine.generate_diverse_responses(
            query=query,
            num_responses=num_responses,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Verbalized Sampling error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/verbalized-sampling/stream")
async def verbalized_sampling_stream(
    request: VerbalizedSamplingRequest,
    model: str = "qwen3-4b",
    num_responses: int = 5,
    temperature: float = 0.8,
    max_tokens: int = 2048
):
    """
    Stream Verbalized Sampling responses using Server-Sent Events

    Implements Stanford's Verbalized Sampling technique to mitigate mode collapse
    and unlock LLM diversity by asking for a distribution of responses.

    Query parameters:
    - model: Model to use (default: qwen3-4b)
    - num_responses: Number of diverse responses (default: 5)
    - temperature: Sampling temperature for diversity (default: 0.8)
    - max_tokens: Max tokens per response (default: 2048)

    Request body:
    - query: User's question or prompt

    Stream events:
    - start: Generation begins
    - chunk: Streaming content chunks
    - complete: Generation finished with parsed responses and diversity score
    - error: Error details
    """
    return create_sse_response(
        stream_verbalized_sampling_events(
            request.query,
            model,
            num_responses,
            temperature,
            max_tokens
        )
    )


async def stream_confession_events(
    query: str,
    model: str,
    temperature: float,
    max_tokens: int
) -> AsyncGenerator[str, None]:
    try:
        from chat_server import MODEL_ENDPOINTS, MODEL_DISPLAY_NAMES
        from confession_engine import ConfessionEngine

        if model not in MODEL_ENDPOINTS:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Model {model} not found'}, ensure_ascii=False)}\n\n"
            return

        endpoint = MODEL_ENDPOINTS[model]
        model_name = MODEL_DISPLAY_NAMES.get(model, model)
        engine = ConfessionEngine(endpoint, model_name)

        async for event in engine.generate_with_confession(
            query=query,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Confessions mode error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/confessions/stream")
async def confessions_stream(
    request: ConfessionRequest,
    model: str = "qwen3-4b",
    temperature: float = 0.7,
    max_tokens: int = 512
):
    """Stream answer + confession events."""
    return create_sse_response(
        stream_confession_events(
            request.query,
            model,
            temperature,
            max_tokens
        )
    )
