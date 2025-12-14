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
    from chat_server import (
        MODEL_CONFIG,
        MODEL_ENDPOINTS,
        MODEL_PROFILES,
        LIVE_CONTEXT_LENGTHS,
        DEFAULT_MODEL_ID
    )

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

    # Build list of API models from MODEL_PROFILES
    api_models = [
        {
            "id": model_id,
            "name": profile.get("display_name", model_id),
            "type": "api",
            "endpoint": None,  # API models use GitHub Models endpoint
            "default": False,
            "context_length": profile.get("context_length", 128000),
        }
        for model_id, profile in MODEL_PROFILES.items()
        if profile.get("model_type") == "api"
    ]

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
    from chat_server import (
        get_model_endpoint_or_error,
        check_model_health,
        HTTPClient
    )

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
