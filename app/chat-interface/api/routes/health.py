import time
import asyncio
from fastapi import APIRouter
from services.health_service import check_model_health, quick_model_health_check, check_single_model_status
from services.monitoring_service import get_load_balancer_status
from core.config import MODEL_ENDPOINTS

router = APIRouter()

@router.get("/health")
async def health():
    """Basic health check for the chat interface"""
    return {"status": "healthy", "service": "chat-interface"}

@router.get("/api/health/detailed")
async def detailed_health():
    """
    Comprehensive health check for all services
    Tests actual endpoints to verify they're working
    """
    results = {
        "chat_interface": {
            "status": "healthy",
            "timestamp": time.time()
        },
        "models": {}
    }

    # Check each model endpoint
    tasks = [
        check_model_health(model_id, endpoint)
        for model_id, endpoint in MODEL_ENDPOINTS.items()
    ]
    
    if tasks:
        model_results = await asyncio.gather(*tasks)
        for model_id, result in zip(MODEL_ENDPOINTS.keys(), model_results):
            results["models"][model_id] = result
    
    # Calculate overall status
    model_statuses = [m["status"] for m in results["models"].values()]
    if not model_statuses:
        results["overall_status"] = "healthy" # No models configured
    elif all(s == "online" for s in model_statuses):
        results["overall_status"] = "healthy"
    elif any(s == "online" for s in model_statuses):
        results["overall_status"] = "degraded"
    else:
        results["overall_status"] = "unhealthy"

    return results

@router.get("/api/system/loadbalancer")
async def loadbalancer_status():
    """
    Load balancer status showing current capacity and active requests per model
    """
    return get_load_balancer_status()

@router.get("/api/badge/system")
async def system_badge():
    """
    Shields.io-compatible badge endpoint for overall system health
    Returns: https://img.shields.io/endpoint?url=<this-endpoint>
    """
    try:
        model_statuses = await quick_model_health_check()
        total_count = len(model_statuses)
        online_count = sum(1 for status in model_statuses.values() if status == "online")

        if total_count == 0:
            color = "lightgrey"
            message = "no models"
        elif online_count == total_count:
            color = "brightgreen"
            message = f"{online_count}/{total_count} online"
        elif online_count > 0:
            color = "yellow"
            message = f"{online_count}/{total_count} online"
        else:
            color = "red"
            message = "offline"

        return {
            "schemaVersion": 1,
            "label": "API Status",
            "message": message,
            "color": color
        }
    except Exception:
        return {
            "schemaVersion": 1,
            "label": "API Status",
            "message": "error",
            "color": "red"
        }

@router.get("/api/badge/model/{model_id}")
async def model_badge_endpoint(model_id: str):
    """
    Shields.io-compatible badge endpoint for individual model health
    Usage: https://img.shields.io/endpoint?url=<this-endpoint>&label=Qwen
    """
    return await check_single_model_status(model_id)
