"""
Shared streaming utilities for SSE (Server-Sent Events) responses
"""

import asyncio
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, List, Any


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

