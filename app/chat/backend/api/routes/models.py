"""
Model listing and health check API routes
"""

from fastapi import APIRouter

from core.state import LIVE_CONTEXT_LENGTHS, get_http_client

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def list_models():
    """
    List all available models (local and API)
    """
    from core.config import MODEL_CONFIG, MODEL_ENDPOINTS, DEFAULT_MODEL_ID
    from clients.model_profiles import MODEL_PROFILES

    # Build list of self-hosted models from MODEL_CONFIG
    # Include priority (from rank) so frontend uses authoritative rankings
    self_hosted_models = [
        {
            "id": config["id"],
            "name": config["name"],
            "type": "self-hosted",
            "endpoint": MODEL_ENDPOINTS.get(config["id"]),
            "default": config.get("default", False),
            "context_length": LIVE_CONTEXT_LENGTHS.get(
                config["id"],
                MODEL_PROFILES.get(config["id"], {}).get("context_length", 0),
            ),
            "priority": config.get("rank", 99),  # Use rank from config/models.py
        }
        for config in MODEL_CONFIG
    ]

    # Build list of GitHub Models
    from services.github_models_service import get_github_model_ids, get_github_model_info

    dynamic_ids = get_github_model_ids()
    github_models = []
    seen_ids = set()

    # Add GitHub Models from dynamic list
    if dynamic_ids:
        for model_id in dynamic_ids:
            profile = MODEL_PROFILES.get(model_id, {})
            # If not in profile, build valid default
            if not profile:
                info = get_github_model_info(model_id) or {}
                profile = {
                    "display_name": info.get("name", model_id),
                    "context_length": int(info.get("limits", {}).get("max_input_tokens", 128000)),
                }

            # Get info to retrieve calculated priority
            info = get_github_model_info(model_id) or {}

            github_models.append({
                "id": model_id,
                "name": profile.get("display_name", model_id),
                "type": "github",
                "endpoint": None,
                "default": False,
                "context_length": profile.get("context_length", 128000),
                "priority": info.get("priority", 100)
            })
            seen_ids.add(model_id)

    # Fallback GitHub Models from MODEL_PROFILES
    # (In case dynamic fetch failed or local dev without internet)
    for model_id, profile in MODEL_PROFILES.items():
        if profile.get("model_type") == "github" and model_id not in seen_ids:
            github_models.append({
                "id": model_id,
                "name": profile.get("display_name", model_id),
                "type": "github",
                "endpoint": None,
                "default": False,
                "context_length": profile.get("context_length", 128000),
            })

    # Build list of external API models (future: DeepSeek direct, GLM, etc.)
    external_models = []
    for model_id, profile in MODEL_PROFILES.items():
        if profile.get("model_type") == "external":
            external_models.append({
                "id": model_id,
                "name": profile.get("display_name", model_id),
                "type": "external",
                "endpoint": None,
                "default": False,
                "context_length": profile.get("context_length", 128000),
            })

    return {
        "models": self_hosted_models + github_models + external_models,
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
    endpoint = get_model_endpoint_or_error(model_id, status_code=404)

    if detailed:
        health_data = await check_model_health(model_id, endpoint)
        return health_data

    # Quick status check
    client = get_http_client()
    try:
        response = await client.get(f"{endpoint}/health", timeout=3.0)
        return {
            "model": model_id,
            "status": "online" if response.status_code == 200 else "offline",
            "endpoint": endpoint,
        }
    except Exception:
        return {
            "model": model_id,
            "status": "offline",
            "endpoint": endpoint,
        }
