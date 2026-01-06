"""
Basic chat API routes
"""

import logging
import httpx
from fastapi import APIRouter, HTTPException

from api.models import ChatRequest, MultiChatRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat(request: ChatRequest):
    """
    Single-model synchronous chat endpoint
    """
    from chat_server import (
        get_model_endpoint_or_error,
        serialize_messages,
        build_completion_payload
    )
    from core.state import get_http_client

    endpoint = get_model_endpoint_or_error(request.model)
    full_url = f"{endpoint}/v1/chat/completions"
    messages = serialize_messages(request.messages)
    payload = build_completion_payload(messages, request.max_tokens, request.temperature)

    logger.info(f"Calling {request.model} at {full_url}")

    client = get_http_client()

    try:
        response = await client.post(full_url, json=payload)

        if response.status_code != 200:
            error_detail = f"Model {request.model} at {endpoint} returned {response.status_code}: {response.text[:200]}"
            logger.error(error_detail)
            raise HTTPException(
                status_code=response.status_code,
                detail=error_detail
            )

        return response.json()

    except httpx.TimeoutException as e:
        error_msg = f"Timeout calling {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=504, detail=error_msg)
    except httpx.ConnectError as e:
        error_msg = f"Cannot connect to {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=503, detail=error_msg)
    except Exception as e:
        error_msg = f"Unexpected error calling {request.model} at {endpoint}: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/stream")
async def chat_stream(request: MultiChatRequest):
    """
    Multi-model streaming chat endpoint using Server-Sent Events.
    Supports both local models and API models (GPT-4, DeepSeek, etc.).
    """
    from chat_server import (
        serialize_messages,
        stream_multiple_models
    )
    from utils.github_token import get_default_github_token

    messages = serialize_messages(request.messages)

    # Get GitHub token from request or environment
    github_token = request.github_token or get_default_github_token()
    openrouter_key = request.openrouter_key

    return create_sse_response(
        stream_multiple_models(
            request.models,
            messages,
            request.max_tokens,
            request.temperature,
            github_token,
            openrouter_key
        )
    )


@router.post("/multi")
async def chat_multi(request: MultiChatRequest):
    """
    Query multiple models in parallel (synchronous responses)
    """
    from chat_server import (
        serialize_messages,
        query_model
    )
    from core.state import get_http_client

    messages = serialize_messages(request.messages)

    client = get_http_client()

    # Query all models in parallel
    tasks = [
        query_model(client, model_id, messages, request.max_tokens, request.temperature)
        for model_id in request.models
    ]

    import asyncio
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Format results
    return {
        "results": [
            result if not isinstance(result, Exception) else {"error": str(result)}
            for result in results
        ]
    }
