"""
Orchestrator mode API routes
"""

import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Request

from api.models import OrchestratorRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["orchestrator"])


async def stream_orchestrator_events(
    query: str,
    max_tokens: int,
    temperature: float,
    max_rounds: int,
    engine: str,
    orchestrator_model_id: str,
    github_token: str
) -> AsyncGenerator[str, None]:
    """
    Stream AutoGen multi-agent orchestration events

    Uses Microsoft AutoGen framework with specialist agents
    """
    try:
        from chat_server import (
            AutoGenOrchestrator,
            ToolOrchestrator,
            MODEL_ENDPOINTS,
            MODEL_PROFILES,
            get_default_github_token
        )

        choice = (engine or "auto").lower()
        if choice == "autogen" and AutoGenOrchestrator is None:
            choice = "tools"
        if choice == "auto":
            choice = "autogen" if AutoGenOrchestrator is not None else "tools"

        if choice == "autogen":
            orch = AutoGenOrchestrator()

            # Resolve custom model config if provided
            orch_config = None
            if orchestrator_model_id:
                if orchestrator_model_id in MODEL_ENDPOINTS:
                    orch_config = {
                        "model": orchestrator_model_id,
                        "base_url": MODEL_ENDPOINTS[orchestrator_model_id],
                        "api_key": "local"
                    }
                elif orchestrator_model_id in MODEL_PROFILES and MODEL_PROFILES[orchestrator_model_id].get("model_type") == "api":
                    # API Model (GitHub Models)
                    token = github_token or get_default_github_token()
                    if not token:
                        yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator.'}, ensure_ascii=False)}\n\n"
                        return

                    orch_config = {
                        "model": orchestrator_model_id,
                        "base_url": "https://models.github.ai/inference",
                        "api_key": token
                    }

            async for event in orch.run_orchestration(
                query=query,
                max_turns=max_rounds,
                orchestrator_config=orch_config
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            return

        # tools (fallback or explicit)
        engine_impl = ToolOrchestrator(max_rounds=max_rounds)
        async for event in engine_impl.run_orchestration(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        return

    except Exception as e:
        logger.error(f"Orchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/orchestrator/stream")
async def orchestrator_stream(payload: OrchestratorRequest, req: Request):
    """
    Stream ToolOrchestra-style intelligent orchestration using Server-Sent Events

    The orchestrator intelligently routes to specialized models and tools
    across multiple rounds to efficiently solve complex tasks.
    """
    # Choose engine via query param (?engine=autogen|tools|auto), default auto
    engine = req.query_params.get("engine", "auto")

    return create_sse_response(
        stream_orchestrator_events(
            payload.query,
            payload.max_tokens,
            payload.temperature,
            payload.max_rounds,
            engine,
            orchestrator_model_id=payload.model,
            github_token=payload.github_token
        )
    )


async def stream_tool_orchestrator_events(
    query: str,
    max_tokens: int,
    temperature: float,
    max_rounds: int
) -> AsyncGenerator[str, None]:
    """
    Stream ToolOrchestrator events (formerly OrchestratorEngine)
    """
    try:
        from tool_orchestrator import ToolOrchestrator

        engine = ToolOrchestrator(max_rounds=max_rounds)

        async for event in engine.run_orchestration(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"ToolOrchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/tool-orchestrator/stream")
async def tool_orchestrator_stream(request: OrchestratorRequest):
    """
    Stream ToolOrchestrator-style intelligent orchestration
    """
    return create_sse_response(
        stream_tool_orchestrator_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.max_rounds
        )
    )
