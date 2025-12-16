import logging
import httpx
from typing import List, Dict, Any, Optional
from core.config import GITHUB_MODELS_API_URL

logger = logging.getLogger(__name__)

# Cache for GitHub models
_GITHUB_MODELS_CACHE: List[Dict[str, Any]] = []
_GITHUB_MODELS_MAP: Dict[str, Dict[str, Any]] = {}

async def fetch_github_models() -> List[Dict[str, Any]]:
    """
    Fetch the list of available models from GitHub Models catalog.
    Returns a list of model definitions.
    """
    global _GITHUB_MODELS_CACHE, _GITHUB_MODELS_MAP
    
    url = "https://models.github.ai/catalog/models"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            models = response.json()
            
            _GITHUB_MODELS_CACHE = models
            _GITHUB_MODELS_MAP = {m["id"]: m for m in models}
            
            logger.info(f"Successfully fetched {len(models)} models from GitHub Models catalog")
            return models
            
    except Exception as e:
        logger.error(f"Failed to fetch GitHub models: {e}")
        return []

def get_github_model_ids() -> List[str]:
    """Get list of available GitHub model IDs"""
    return list(_GITHUB_MODELS_MAP.keys())

def get_github_model_info(model_id: str) -> Optional[Dict[str, Any]]:
    """Get info for a specific GitHub model"""
    return _GITHUB_MODELS_MAP.get(model_id)
