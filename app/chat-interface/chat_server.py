"""
Multi-Model Chat Interface
Web-based chat UI for interacting with different LLM backends
"""

import os
import re
import time
import asyncio
import json
import logging
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import uvicorn
import pathlib

# Discussion mode imports
from orchestrator import GitHubModelsOrchestrator
from discussion_engine import DiscussionEngine
from model_profiles import MODEL_PROFILES

# Orchestrator mode imports
from autogen_orchestrator import AutoGenOrchestrator

# Verbalized Sampling mode imports
from verbalized_sampling_engine import VerbalizedSamplingEngine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sanitize_error_message(error_text: str, endpoint: str = "") -> str:
    """
    Sanitize error messages to hide raw HTML/technical details from users.
    Logs full details server-side.
    """
    # Log full error for debugging
    logger.error(f"Model error from {endpoint}: {error_text[:500]}...")

    # Check for common error patterns and return user-friendly messages
    error_lower = error_text.lower()

    if "cloudflare" in error_lower or "<!doctype" in error_lower or "<html" in error_lower:
        return "Service temporarily unavailable. The model server may be down or experiencing issues."

    if "timeout" in error_lower:
        return "Request timed out. Please try again."

    if "connection refused" in error_lower or "connect error" in error_lower:
        return "Cannot connect to model server. Please try again later."

    if "502" in error_text or "503" in error_text or "504" in error_text:
        return "Model server is temporarily unavailable."

    if "520" in error_text or "521" in error_text or "522" in error_text:
        return "Service temporarily unavailable (CDN error)."

    # Strip any HTML tags as a fallback
    clean_text = re.sub(r'<[^>]+>', '', error_text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Truncate if still too long
    if len(clean_text) > 200:
        return clean_text[:200] + "..."

    return clean_text if clean_text else "An unexpected error occurred."

app = FastAPI(
    title="LLM Chat Interface",
    description="Web chat interface for multiple LLM models",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
static_dir = pathlib.Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
CHAT_HTML_PATH = static_dir / "chat.html"


MODEL_CONFIG = (
    {
        "id": "qwen2.5-7b",
        "name": "Qwen 2.5-7B",
        "env": "QWEN_API_URL",
        "default_url": "http://localhost:8001",
        "default": True,
    },
    {
        "id": "phi-3-mini",
        "name": "Phi-3 Mini",
        "env": "PHI_API_URL",
        "default_url": "http://localhost:8002",
    },
    {
        "id": "llama-3.2-3b",
        "name": "Llama 3.2-3B",
        "env": "LLAMA_API_URL",
        "default_url": "http://localhost:8003",
    },
)

MODEL_ENDPOINTS = {
    config["id"]: os.getenv(config["env"], config["default_url"])
    for config in MODEL_CONFIG
}

MODEL_DISPLAY_NAMES = {
    config["id"]: config["name"]
    for config in MODEL_CONFIG
}

DEFAULT_MODEL_ID = next(
    (config["id"] for config in MODEL_CONFIG if config.get("default")),
    MODEL_CONFIG[0]["id"] if MODEL_CONFIG else None,
)

# Log configured endpoints at startup
logger.info("=" * 60)
logger.info("MODEL ENDPOINTS CONFIGURED:")
for model_id, endpoint in MODEL_ENDPOINTS.items():
    logger.info(f"  {model_id}: {endpoint}")
logger.info("=" * 60)

class ChatMessage(BaseModel):
    role: str
    content: str

class GenerationParams(BaseModel):
    max_tokens: int = 512
    temperature: float = 0.7


class ChatRequest(GenerationParams):
    model: str
    messages: List[ChatMessage]


class MultiChatRequest(GenerationParams):
    models: List[str]
    messages: List[ChatMessage]

class ModelStatus(BaseModel):
    model: str
    status: str
    endpoint: str

class DiscussionRequest(GenerationParams):
    query: str
    orchestrator_model: Optional[str] = None  # Model ID for orchestrator (e.g., 'gpt-5-nano', 'qwen2.5-7b')
    github_token: Optional[str] = None  # User-provided GitHub token for API models
    turns: int = 2  # Number of discussion rounds (all models participate each round)
    participants: Optional[List[str]] = None  # List of model IDs to participate (default: all local models)

class OrchestratorRequest(GenerationParams):
    query: str
    max_rounds: int = 5  # Maximum orchestration rounds

class VerbalizedSamplingRequest(BaseModel):
    query: str


def serialize_messages(messages: List[ChatMessage]) -> List[dict]:
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def build_completion_payload(
    messages: List[dict],
    max_tokens: int,
    temperature: float,
    *,
    stream: bool = False,
) -> dict:
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if stream:
        payload["stream"] = True
    return payload


def get_model_endpoint_or_error(model_id: str, *, status_code: int = 400) -> str:
    if model_id not in MODEL_ENDPOINTS:
        raise HTTPException(
            status_code=status_code,
            detail=f"Unknown model: {model_id}. Available: {list(MODEL_ENDPOINTS.keys())}",
        )
    return MODEL_ENDPOINTS[model_id]



@app.get("/")
async def chat_interface():
    if CHAT_HTML_PATH.exists():
        return FileResponse(CHAT_HTML_PATH, media_type="text/html")
    raise HTTPException(status_code=404, detail="Chat interface not found")

@app.get("/discussion", response_class=HTMLResponse)
async def discussion_interface():
    """Serve discussion mode interface"""
    import pathlib
    discussion_html_path = pathlib.Path(__file__).parent / "static" / "discussion.html"
    if discussion_html_path.exists():
        return discussion_html_path.read_text()
    else:
        raise HTTPException(status_code=404, detail="Discussion interface not found")

@app.get("/autogen", response_class=HTMLResponse)
async def autogen_interface():
    """Serve AutoGen mode interface"""
    import pathlib
    autogen_html_path = pathlib.Path(__file__).parent / "static" / "orchestrator.html"
    if autogen_html_path.exists():
        return autogen_html_path.read_text()
    else:
        raise HTTPException(status_code=404, detail="AutoGen interface not found")

@app.get("/diversity", response_class=HTMLResponse)
async def diversity_interface():
    """Serve Verbalized Sampling interface"""
    import pathlib
    diversity_html_path = pathlib.Path(__file__).parent / "static" / "verbalized_sampling.html"
    if diversity_html_path.exists():
        return diversity_html_path.read_text()
    else:
        raise HTTPException(status_code=404, detail="Verbalized Sampling interface not found")

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "chat-interface"}

@app.get("/api/models")
async def list_models():
    return {
        "models": [
            {
                "id": config["id"],
                "name": config["name"],
                "endpoint": MODEL_ENDPOINTS[config["id"]],
                "default": config.get("default", False),
            }
            for config in MODEL_CONFIG
        ],
        "endpoints": MODEL_ENDPOINTS,
        "default_model": DEFAULT_MODEL_ID,
    }

@app.get("/api/models/{model_id}/status")
async def model_status(model_id: str):
    endpoint = get_model_endpoint_or_error(model_id, status_code=404)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{endpoint}/health")
            if response.status_code == 200:
                return ModelStatus(model=model_id, status="online", endpoint=endpoint)
    except Exception:
        pass

    return ModelStatus(model=model_id, status="offline", endpoint=endpoint)

@app.post("/api/chat")
async def chat(request: ChatRequest):
    endpoint = get_model_endpoint_or_error(request.model)
    full_url = f"{endpoint}/v1/chat/completions"
    messages = serialize_messages(request.messages)
    payload = build_completion_payload(messages, request.max_tokens, request.temperature)

    logger.info(f"Calling {request.model} at {full_url}")

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                full_url,
                json=payload
            )

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

async def query_model(client: httpx.AsyncClient, model_id: str, messages: list, max_tokens: int, temperature: float):
    """Query a single model and return results with timing"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    start_time = time.time()
    try:
        response = await client.post(
            f"{endpoint}/v1/chat/completions",
            json=build_completion_payload(messages, max_tokens, temperature)
        )
        elapsed = time.time() - start_time

        if response.status_code != 200:
            error_msg = sanitize_error_message(response.text, endpoint)
            return {
                "model": display_name,
                "content": error_msg,
                "error": True,
                "time": elapsed
            }

        data = response.json()
        return {
            "model": display_name,
            "content": data["choices"][0]["message"]["content"],
            "usage": data.get("usage", {}),
            "time": elapsed,
            "error": False
        }

    except httpx.TimeoutException:
        logger.error(f"Timeout querying {endpoint}")
        return {
            "model": display_name,
            "content": "Request timed out. Please try again.",
            "error": True,
            "time": time.time() - start_time
        }
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        return {
            "model": display_name,
            "content": "Cannot connect to model server. Please try again later.",
            "error": True,
            "time": time.time() - start_time
        }
    except Exception as e:
        logger.exception(f"Unexpected error querying {endpoint}")
        return {
            "model": display_name,
            "content": "An unexpected error occurred. Please try again.",
            "error": True,
            "time": time.time() - start_time
        }

@app.post("/api/chat/multi")
async def chat_multi(request: MultiChatRequest):
    """Query multiple models in parallel"""
    messages = serialize_messages(request.messages)

    async with httpx.AsyncClient(timeout=120.0) as client:
        tasks = [
            query_model(client, model_id, messages, request.max_tokens, request.temperature)
            for model_id in request.models
            if model_id in MODEL_ENDPOINTS
        ]

        responses = await asyncio.gather(*tasks)

    return {"responses": responses}


async def stream_model_response(model_id: str, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream response from a single model using SSE format"""
    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)
    start_time = time.time()
    total_content = ""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{endpoint}/v1/chat/completions",
                json=build_completion_payload(
                    messages,
                    max_tokens,
                    temperature,
                    stream=True,
                )
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_msg = sanitize_error_message(error_text.decode(), endpoint)
                    yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': error_msg})}\n\n"
                    return

                # Send initial event
                yield f"data: {json.dumps({'model': display_name, 'event': 'start'})}\n\n"

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if "choices" in data and len(data["choices"]) > 0:
                                delta = data["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    total_content += content
                                    yield f"data: {json.dumps({'model': display_name, 'content': content, 'event': 'token'})}\n\n"
                        except json.JSONDecodeError:
                            pass

                # Send completion event with stats
                elapsed = time.time() - start_time
                token_count = len(total_content.split())  # Rough estimate
                yield f"data: {json.dumps({'model': display_name, 'event': 'done', 'time': elapsed, 'total_content': total_content, 'token_estimate': token_count})}\n\n"

    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'Request timed out. Please try again.'})}\n\n"
    except httpx.ConnectError as e:
        logger.error(f"Connection error to {endpoint}: {e}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'Cannot connect to model server. Please try again later.'})}\n\n"
    except Exception as e:
        logger.exception(f"Unexpected error streaming from {endpoint}")
        yield f"data: {json.dumps({'model': display_name, 'error': True, 'content': 'An unexpected error occurred. Please try again.'})}\n\n"


async def stream_multiple_models(models: list, messages: list, max_tokens: int, temperature: float) -> AsyncGenerator[str, None]:
    """Stream responses from multiple models, yielding chunks in real-time as they arrive"""

    # Use a queue to collect chunks from all models in real-time
    queue: asyncio.Queue = asyncio.Queue()
    active_streams = len([m for m in models if m in MODEL_ENDPOINTS])
    completed_streams = 0

    async def stream_to_queue(model_id: str):
        """Stream from a single model and put chunks into the shared queue"""
        nonlocal completed_streams
        try:
            async for chunk in stream_model_response(model_id, messages, max_tokens, temperature):
                await queue.put(chunk)
        finally:
            completed_streams += 1
            # Signal completion when all streams are done
            if completed_streams >= active_streams:
                await queue.put(None)  # Sentinel to signal completion

    # Start all streams concurrently
    tasks = [
        asyncio.create_task(stream_to_queue(model_id))
        for model_id in models
        if model_id in MODEL_ENDPOINTS
    ]

    if not tasks:
        yield f"data: {json.dumps({'event': 'all_done'})}\n\n"
        return

    # Yield chunks as they arrive from any model
    try:
        while True:
            chunk = await queue.get()
            if chunk is None:  # Sentinel - all streams completed
                break
            yield chunk
    finally:
        # Ensure all tasks are cleaned up
        for task in tasks:
            if not task.done():
                task.cancel()

    # Send final done event
    yield f"data: {json.dumps({'event': 'all_done'})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(request: MultiChatRequest):
    """Stream chat responses using Server-Sent Events"""
    messages = serialize_messages(request.messages)

    return StreamingResponse(
        stream_multiple_models(request.models, messages, request.max_tokens, request.temperature),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def stream_discussion_events(
    query: str,
    max_tokens: int,
    temperature: float,
    orchestrator_model: Optional[str] = None,
    github_token: Optional[str] = None,
    turns: int = 2,
    participants: Optional[List[str]] = None
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
        # Determine orchestrator model type
        api_models = [
            'gpt-4.1', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
            'deepseek-v3-0324', 'cohere-command-r-plus-08-2024',
            'llama-3.3-70b-instruct', 'llama-4-scout-17b-16e-instruct', 'meta-llama-3.1-405b-instruct'
        ]
        local_models = list(MODEL_ENDPOINTS.keys())

        selected_orchestrator = orchestrator_model or 'gpt-4o'
        is_api_model = selected_orchestrator in api_models

        if is_api_model:
            # Initialize GitHub Models API orchestrator
            # Use user-provided token if available, otherwise fall back to server env var
            token = github_token or os.getenv("GH_MODELS_TOKEN")
            if not token:
                yield f"data: {json.dumps({'event': 'error', 'error': 'GitHub token required for API orchestrator. Please provide your token or contact the server admin.'})}\n\n"
                return

            orchestrator = GitHubModelsOrchestrator(
                github_token=token,
                model_id=selected_orchestrator
            )
        elif selected_orchestrator in local_models:
            # Initialize local model orchestrator
            local_endpoint = MODEL_ENDPOINTS[selected_orchestrator]
            orchestrator = GitHubModelsOrchestrator(
                github_token="local",  # Placeholder, won't be used
                model_id=selected_orchestrator,
                api_url=f"{local_endpoint}/v1/chat/completions"
            )
            # Override the headers method for local models
            orchestrator._get_headers = lambda: {"Content-Type": "application/json"}
        else:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Unknown orchestrator model: {selected_orchestrator}'})}\n\n"
            return

        # Initialize discussion engine
        engine = DiscussionEngine(
            orchestrator=orchestrator,
            model_endpoints=MODEL_ENDPOINTS,
            timeout_per_turn=60
        )

        # Run discussion with streaming events
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


@app.post("/api/chat/discussion/stream")
async def discussion_stream(request: DiscussionRequest):
    """
    Stream collaborative multi-model discussion using Server-Sent Events

    Models discuss the query together, guided by an orchestrator (GPT-5-nano)
    that evaluates contributions based on each model's benchmark-proven strengths.

    Request body:
    - query: User's question or request
    - max_tokens: Max tokens per model response (default: 512)
    - temperature: Sampling temperature (default: 0.7)

    Stream events (all sent as SSE):
    - analysis_complete: Orchestrator's query analysis with domain classification
    - turn_start: Model begins turn with expertise score
    - turn_chunk: Streaming response content
    - turn_complete: Turn finished with quality evaluation
    - synthesis_complete: Final synthesis plan
    - discussion_complete: Full discussion with final response
    - error: Error details
    """
    return StreamingResponse(
        stream_discussion_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.orchestrator_model,
            request.github_token,
            request.turns,
            request.participants
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# Orchestrator Mode Endpoint
async def stream_orchestrator_events(
    query: str,
    max_tokens: int,
    temperature: float,
    max_rounds: int
) -> AsyncGenerator[str, None]:
    """
    Stream AutoGen multi-agent orchestration events

    Uses Microsoft AutoGen framework with specialist agents
    """
    try:
        engine = AutoGenOrchestrator()

        async for event in engine.run_orchestration(
            query=query,
            max_turns=max_rounds
        ):
            # Ensure proper JSON encoding with explicit settings
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    except Exception as e:
        logger.error(f"Orchestrator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/chat/orchestrator/stream")
async def orchestrator_stream(request: OrchestratorRequest):
    """
    Stream ToolOrchestra-style intelligent orchestration using Server-Sent Events

    The orchestrator (Qwen 2.5-7B) intelligently routes to specialized models and tools
    across multiple rounds to efficiently solve complex tasks.

    Request body:
    - query: User's question or request
    - max_tokens: Max tokens per model response (default: 512)
    - temperature: Sampling temperature (default: 0.7)
    - max_rounds: Maximum orchestration rounds (default: 5)

    Stream events (all sent as SSE):
    - start: Orchestration begins
    - round_start: New round begins
    - tool_call: Orchestrator calls a tool
    - tool_result: Tool execution result
    - orchestrator_thinking: Orchestrator reasoning
    - final_answer: Final synthesized answer
    - complete: Orchestration finished
    - error: Error details

    Tools available:
    - enhance_reasoning: Call specialized reasoning models (Qwen/Phi/Llama)
    - answer: Generate final answer with best model
    - search: Web search for missing information
    - code_interpreter: Execute Python code
    """
    return StreamingResponse(
        stream_orchestrator_events(
            request.query,
            request.max_tokens,
            request.temperature,
            request.max_rounds
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ===== VERBALIZED SAMPLING MODE =====
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
        # Get model endpoint
        if model not in MODEL_ENDPOINTS:
            yield f"data: {json.dumps({'event': 'error', 'error': f'Model {model} not found'}, ensure_ascii=False)}\n\n"
            return
        
        model_endpoint = MODEL_ENDPOINTS[model]
        model_name = MODEL_DISPLAY_NAMES.get(model, model)
        
        # Create engine and stream responses
        engine = VerbalizedSamplingEngine(model_endpoint, model_name)
        
        async for event in engine.generate_diverse_responses(
            query=query,
            num_responses=num_responses,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            # Ensure proper JSON encoding
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    
    except Exception as e:
        logger.error(f"Verbalized Sampling error: {e}", exc_info=True)
        yield f"data: {json.dumps({'event': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/verbalized-sampling/stream")
async def verbalized_sampling_stream(
    request: VerbalizedSamplingRequest,
    model: str = "qwen2.5-7b",
    num_responses: int = 5,
    temperature: float = 0.8,
    max_tokens: int = 1024
):
    """
    Stream Verbalized Sampling responses using Server-Sent Events
    
    Implements Stanford's Verbalized Sampling technique to mitigate mode collapse
    and unlock LLM diversity by asking for a distribution of responses.
    
    Query parameters:
    - model: Model to use (default: qwen2.5-7b)
    - num_responses: Number of diverse responses (default: 5)
    - temperature: Sampling temperature for diversity (default: 0.8)
    - max_tokens: Max tokens per response (default: 1024)
    
    Request body:
    - query: User's question or prompt
    
    Stream events:
    - start: Generation begins
    - chunk: Streaming content chunks
    - complete: Generation finished with parsed responses and diversity score
    - error: Error details
    """
    return StreamingResponse(
        stream_verbalized_sampling_events(
            request.query,
            model,
            num_responses,
            temperature,
            max_tokens
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
