"""
Shared streaming utilities for SSE (Server-Sent Events) responses
"""

import json
import logging
import asyncio
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, List, Any, Optional, Callable, Awaitable

logger = logging.getLogger(__name__)


async def stream_engine_events(
    engine_class: type,
    run_method: str,
    participants: List[str],
    run_kwargs: dict,
    github_token: Optional[str] = None,
    openrouter_key: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Generic SSE streaming factory for engine-based modes (analyze, debate).

    Args:
        engine_class: Engine class to instantiate (AnalyzeEngine, DebateEngine)
        run_method: Name of the run method on the engine (e.g., "run_analyze", "run_debate")
        participants: List of model IDs
        run_kwargs: Kwargs to pass to the run method
        github_token: GitHub token for API models
        openrouter_key: OpenRouter API key

    Yields:
        SSE-formatted event strings
    """
    try:
        from core.config import MODEL_ENDPOINTS

        if not participants:
            yield f"data: {json.dumps({'event': 'error', 'error': 'No participants selected'})}\n\n"
            return

        engine = engine_class(
            model_endpoints=MODEL_ENDPOINTS,
            github_token=github_token,
            openrouter_key=openrouter_key
        )

        method = getattr(engine, run_method)
        async for event in method(participants=participants, **run_kwargs):
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Engine streaming error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


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


async def merge_async_generators(generators: List[AsyncGenerator]) -> AsyncGenerator[Any, None]:
    """
    Merge multiple async generators into one stream, yielding items as they arrive.

    This is useful for running multiple model streams in parallel and collecting
    results in real-time from whichever completes first.

    Args:
        generators: List of async generators to merge

    Yields:
        Items from any of the generators as they become available

    Example:
        ```python
        async def stream1():
            yield {"model": "a", "chunk": "hello"}

        async def stream2():
            yield {"model": "b", "chunk": "world"}

        async for event in merge_async_generators([stream1(), stream2()]):
            print(event)  # Items from both streams
        ```
    """
    if not generators:
        return

    queues = [asyncio.Queue() for _ in generators]

    async def consume(gen: AsyncGenerator, queue: asyncio.Queue):
        """Consume a generator and put items into queue"""
        try:
            async for item in gen:
                await queue.put(item)
        except Exception as e:
            # Put error event in queue
            await queue.put({"type": "error", "error": str(e)})
        finally:
            await queue.put(None)  # Signal completion

    # Start all consumers
    consumers = [
        asyncio.create_task(consume(gen, queue))
        for gen, queue in zip(generators, queues)
    ]

    # Yield items as they arrive from any queue
    active = len(queues)
    while active > 0:
        for queue in queues:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=0.01)
                if item is None:
                    active -= 1
                else:
                    yield item
            except asyncio.TimeoutError:
                continue

    # Wait for all consumers to finish
    await asyncio.gather(*consumers, return_exceptions=True)

