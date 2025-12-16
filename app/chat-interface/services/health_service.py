import time
import asyncio
import httpx
import logging
from typing import Dict, Any

from clients.http_client import HTTPClient
from core.config import MODEL_ENDPOINTS, MODEL_DISPLAY_NAMES
from core.state import LIVE_CONTEXT_LENGTHS, is_inference_fresh, get_last_inference_age

logger = logging.getLogger(__name__)

async def fetch_model_capacity(model_id: str, endpoint: str) -> int:
    """
    Query a model's /health/details endpoint to get its max_concurrent capacity.
    Returns the model's reported capacity, or a default of 1 if unavailable.
    """
    try:
        client = HTTPClient.get_client()
        response = await client.get(f"{endpoint}/health/details", timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            capacity = data.get("max_concurrent", 1)
            logger.info(f"✓ {model_id}: max_concurrent={capacity}")
            return capacity
        else:
            logger.warning(f"⚠️  {model_id}: health check returned {response.status_code}, using default capacity=1")
            return 1
    except Exception as e:
        logger.warning(f"⚠️  {model_id}: failed to fetch capacity ({e}), using default capacity=1")
        return 1

async def check_model_health(model_id: str, endpoint: str) -> Dict[str, Any]:
    """
    Perform a detailed health check on a single model, including inference test.
    Also fetches and caches the live context length from /health/details.
    """
    client = HTTPClient.get_client()
    start_time = time.time()
    
    try:
        # Test health endpoint
        health_response = await client.get(f"{endpoint}/health")

        if health_response.status_code == 200:
            health_data = health_response.json()
            
            # Try to fetch detailed health info including actual n_ctx
            try:
                details_response = await client.get(f"{endpoint}/health/details", timeout=5.0)
                if details_response.status_code == 200:
                    details_data = details_response.json()
                    if "n_ctx" in details_data:
                        LIVE_CONTEXT_LENGTHS[model_id] = details_data["n_ctx"]
                        logger.debug(f"Cached live context length for {model_id}: {details_data['n_ctx']}")
            except Exception:
                pass  # Details endpoint is optional, don't fail the health check

            # Check if model had recent successful inference - skip test if so
            if is_inference_fresh(model_id):
                last_age = get_last_inference_age(model_id)
                age_str = f"{int(last_age)}s ago" if last_age else "unknown"
                logger.debug(f"Skipping inference test for {model_id} - recent activity {age_str}")
                return {
                    "status": "online",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "verified_by_recent_activity",
                    "last_inference_age_seconds": int(last_age) if last_age else None,
                    "response_time_ms": int((time.time() - start_time) * 1000),
                    "context_length": LIVE_CONTEXT_LENGTHS.get(model_id)
                }

            # No recent inference - perform actual test to verify model works
            try:
                test_response = await client.post(
                    f"{endpoint}/v1/chat/completions",
                    json={
                        "messages": [{"role": "user", "content": "Hi"}],
                        "max_tokens": 5,
                        "temperature": 0.1
                    },
                    timeout=30.0
                )

                return {
                    "status": "online",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "passed" if test_response.status_code == 200 else "failed",
                    "response_time_ms": int((time.time() - start_time) * 1000),
                    "context_length": LIVE_CONTEXT_LENGTHS.get(model_id)
                }
            except Exception as e:
                # Health passed but inference failed
                return {
                    "status": "degraded",
                    "endpoint": endpoint,
                    "health": health_data,
                    "inference_test": "failed",
                    "error": str(e),
                    "response_time_ms": int((time.time() - start_time) * 1000),
                    "context_length": LIVE_CONTEXT_LENGTHS.get(model_id)
                }
        else:
            return {
                "status": "unhealthy",
                "endpoint": endpoint,
                "error": f"Health check returned {health_response.status_code}",
                "response_time_ms": int((time.time() - start_time) * 1000)
            }

    except httpx.TimeoutException:
        return {
            "status": "offline",
            "endpoint": endpoint,
            "error": "Connection timeout",
            "response_time_ms": int((time.time() - start_time) * 1000)
        }
    except Exception as e:
        return {
            "status": "offline",
            "endpoint": endpoint,
            "error": str(e),
            "response_time_ms": int((time.time() - start_time) * 1000)
        }

async def quick_model_health_check(timeout: float = 3.0) -> Dict[str, str]:
    """Lightweight /health checks for badge endpoints."""
    client = HTTPClient.get_client()

    async def check_model(model_id: str, endpoint: str):
        try:
            response = await client.get(f"{endpoint}/health", timeout=timeout)
            if response.status_code == 200:
                return model_id, "online"
            return model_id, "unhealthy"
        except httpx.TimeoutException:
            return model_id, "timeout"
        except Exception:
            return model_id, "offline"

    tasks = [check_model(model_id, endpoint) for model_id, endpoint in MODEL_ENDPOINTS.items()]
    results = await asyncio.gather(*tasks)
    return dict(results)

async def check_single_model_status(model_id: str) -> Dict[str, Any]:
    """Check status for a single model for badge usage."""
    if model_id not in MODEL_ENDPOINTS:
        return {
            "status": "unknown. model not configured",
            "color": "lightgrey"
        }

    endpoint = MODEL_ENDPOINTS[model_id]
    display_name = MODEL_DISPLAY_NAMES.get(model_id, model_id)

    try:
        client = HTTPClient.get_client()
        response = await client.get(f"{endpoint}/health", timeout=5.0)

        if response.status_code == 200:
            return {
                "label": display_name,
                "message": "online",
                "color": "brightgreen"
            }
        else:
            return {
                "label": display_name,
                "message": "unhealthy",
                "color": "orange"
            }
    except Exception:
        return {
            "label": display_name,
            "message": "offline",
            "color": "red"
        }
