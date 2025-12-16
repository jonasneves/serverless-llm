"""
Discussion/Roundtable mode API routes
"""

import json
import logging
from typing import Optional, List, AsyncGenerator
from fastapi import APIRouter

from api.models import DiscussionRequest
from services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/discussion", tags=["discussion"])


async def stream_discussion_events(
    query: str,
    max_tokens: int,
    temperature: float,
    orchestrator_model: Optional[str],
    github_token: Optional[str],
    turns: int,
    participants: Optional[List[str]]
) -> AsyncGenerator[str, None]:
    """
    Stream discussion events as Server-Sent Events

    Events:
    - analysis_start: Orchestrator begins analyzing query
    - analysis_complete: Query analysis results with domain weights
    - turn_start: Model begins responding
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with evaluation
    - synthesis_start: Begin creating final response
    - synthesis_complete: Synthesis plan ready
    - discussion_complete: Full discussion finished
    - error: Error occurred
    """
    try:
        from discussion_engine import DiscussionEngine
        from utils.github_token import get_default_github_token
        from core.config import MODEL_ENDPOINTS

        # Determine orchestrator model type
        from services.github_models_service import get_github_model_ids
        api_models = get_github_model_ids()
        
        # Fallback if service failed or hasn't run
        if not api_models:
            api_models = [
                'openai/gpt-4.1', 'openai/gpt-4o',
                'openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-5-nano',
                'deepseek/DeepSeek-V3-0324', 'azureml-cohere/Cohere-command-r-plus-08-2024',
                'azureml-meta/Llama-3.3-70B-Instruct', 'azureml-meta/Llama-4-Scout-17B-16E-Instruct', 'azureml-meta/Llama-3.1-405B-Instruct'
            ]

        selected_orchestrator = orchestrator_model or 'openai/gpt-4o'
        is_api_model = selected_orchestrator in api_models

        if is_api_model:
            from orchestrator import GitHubModelsOrchestrator

            # Use user-provided token if available
            token = github_token or get_default_github_token()
            if not token:
                yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator'})}\n\n"
                return

            orchestrator = GitHubModelsOrchestrator(
                github_token=token,
                model_id=selected_orchestrator
            )
        else:
            # Local model orchestrator
            from orchestrator import LocalModelOrchestrator

            if selected_orchestrator not in MODEL_ENDPOINTS:
                yield f"data: {json.dumps({'event': 'error', 'error': f'Unknown orchestrator model: {selected_orchestrator}'})}\n\n"
                return

            orchestrator = LocalModelOrchestrator(
                model_id=selected_orchestrator,
                api_url=MODEL_ENDPOINTS[selected_orchestrator]
            )

        # Run discussion with orchestrator
        engine = DiscussionEngine(
            orchestrator=orchestrator,
            model_endpoints=MODEL_ENDPOINTS
        )
        async for event in engine.run_discussion(
            query=query,
            max_tokens=max_tokens,
            temperature=temperature,
            turns=turns,
            participants=participants
        ):
            # Forward all events to client
            yield f"data: {json.dumps({'event': event['type'], **event})}\n\n"

    except Exception as e:
        logger.error(f"Discussion error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def discussion_stream(request: DiscussionRequest):
    """
    Stream collaborative multi-model discussion using Server-Sent Events

    Models discuss the query together, guided by an orchestrator
    that evaluates contributions based on each model's benchmark-proven strengths.
    """
    return create_sse_response(
        stream_discussion_events(
            query=request.query,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            orchestrator_model=request.orchestrator_model,
            github_token=request.github_token,
            turns=request.turns,
            participants=request.participants
        )
    )
