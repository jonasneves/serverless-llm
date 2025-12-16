"""
Model listing and health check API routes
"""

from fastapi import APIRouter

from api.models import ModelStatus

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def list_models():
    """
    List all available models (local and API)
    """
    from core.config import MODEL_CONFIG, MODEL_ENDPOINTS, DEFAULT_MODEL_ID
    from core.state import LIVE_CONTEXT_LENGTHS
    from model_profiles import MODEL_PROFILES

    def get_context_length(model_id: str) -> int:
        """Get context length: prefer live value from server, fall back to profile."""
        if model_id in LIVE_CONTEXT_LENGTHS:
            return LIVE_CONTEXT_LENGTHS[model_id]
        return MODEL_PROFILES.get(model_id, {}).get("context_length", 0)

    # Build list of local models from MODEL_CONFIG
    local_models = [
        {
            "id": config["id"],
            "name": config["name"],
            "type": "local",
            "endpoint": MODEL_ENDPOINTS.get(config["id"]),
            "default": config.get("default", False),
            "context_length": get_context_length(config["id"]),
        }
        for config in MODEL_CONFIG
    ]

    # Build list of API models
    from services.github_models_service import get_github_model_ids, get_github_model_info
    
    dynamic_ids = get_github_model_ids()
    api_models = []
    seen_ids = set()

    # 1. Add models from MODEL_PROFILES if they are verified (or if we trust them)
    # Actually, we should trust the dynamic list more.
    # Let's iterate through the dynamic list and use profile data if available.
    
    if dynamic_ids:
        for model_id in dynamic_ids:
            profile = MODEL_PROFILES.get(model_id, {})
            # If not in profile, build valid default
            if not profile:
                 info = get_github_model_info(model_id) or {}
                 profile = {
                     "display_name": info.get("name", model_id),
                     "context_length": int(info.get("limits", {}).get("max_input_tokens", 128000))
                 }
            
            api_models.append({
                "id": model_id,
                "name": profile.get("display_name", model_id),
                "type": "api",
                "endpoint": None,
                "default": False,
                "context_length": profile.get("context_length", 128000),
            })
            seen_ids.add(model_id)
    
    # 2. Add any remaining API models from MODEL_PROFILES that weren't in the dynamic list
    # (Fallback in case dynamic fetch failed or local dev without internet)
    for model_id, profile in MODEL_PROFILES.items():
        if profile.get("model_type") == "api" and model_id not in seen_ids:
            api_models.append({
                "id": model_id,
                "name": profile.get("display_name", model_id),
                "type": "api",
                "endpoint": None,
                "default": False,
                "context_length": profile.get("context_length", 128000),
            })

    return {
        "models": local_models + api_models,
        "endpoints": MODEL_ENDPOINTS,
        "default_model": DEFAULT_MODEL_ID,
    }


@router.get("/{model_id}/status")
async def model_status(model_id: str, detailed: bool = False):
    """
    Get health status for a specific model
    """
    from chat_server import get_model_endpoint_or_error
    from services.health_service import check_model_health
    from http_client import HTTPClient

    endpoint = get_model_endpoint_or_error(model_id, status_code=404)

    if detailed:
        health_data = await check_model_health(model_id, endpoint)
        return health_data
    else:
        # Quick status check
        client = HTTPClient.get_client()
        try:
            response = await client.get(f"{endpoint}/health", timeout=3.0)
            return {
                "model": model_id,
                "status": "online" if response.status_code == 200 else "offline",
                "endpoint": endpoint
            }
        except Exception:
            return {
                "model": model_id,
                "status": "offline",
                "endpoint": endpoint
            }
