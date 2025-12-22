import logging
import httpx
import json
import pathlib
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Cache for GitHub models
_GITHUB_MODELS_CACHE: List[Dict[str, Any]] = []
_GITHUB_MODELS_MAP: Dict[str, Dict[str, Any]] = {}

CACHE_FILE = pathlib.Path(__file__).parent.parent / "github_models_cache.json"

async def fetch_github_models() -> List[Dict[str, Any]]:
    """
    Fetch accessible models from GitHub Models Catalog.
    Uses local file cache if available to avoid repeated network calls.
    """
    global _GITHUB_MODELS_CACHE, _GITHUB_MODELS_MAP
    
    # Try to load from local cache first
    if CACHE_FILE.exists():
        try:
            content = CACHE_FILE.read_text()
            models = json.loads(content)
            _GITHUB_MODELS_CACHE = models
            _GITHUB_MODELS_MAP = {m["id"]: m for m in models}
            logger.info(f"Loaded {len(models)} models from local cache")
            
            # Sort cache by priority (re-calculate in case logic changed)
            for model in _GITHUB_MODELS_CACHE:
                model["priority"] = calculate_model_priority(model)
            
            _GITHUB_MODELS_CACHE.sort(key=lambda x: x.get("priority", 100))
            return _GITHUB_MODELS_CACHE
        except Exception as e:
            logger.warning(f"Failed to load cache file: {e}")

    url = "https://models.github.ai/catalog/models" 
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            
            if response.status_code == 200:
                models = response.json()
                
                # Calculate priority for each model
                for model in models:
                    model["priority"] = calculate_model_priority(model)
                
                # Sort models by priority
                models.sort(key=lambda x: x.get("priority", 100))
                
                _GITHUB_MODELS_CACHE = models
                _GITHUB_MODELS_MAP = {m["id"]: m for m in models}
                
                logger.info(f"Successfully fetched {len(models)} models from GitHub Models catalog")
                
                # Save to cache
                try:
                    CACHE_FILE.write_text(json.dumps(models, indent=2))
                except Exception as e:
                    logger.warning(f"Failed to write cache file: {e}")
                
                return _GITHUB_MODELS_CACHE
                    
            else:
                logger.error(f"Failed to fetch GitHub models: {response.status_code}")
                return []
                
    except Exception as e:
        logger.error(f"Error fetching GitHub models: {e}")
        return []

def calculate_model_priority(model: Dict[str, Any]) -> int:
    """
    Calculate a priority score for a model based on its metadata.
    Lower score = higher priority.
    """
    publisher = model.get("publisher", "").lower()
    name = model.get("name", "").lower()
    
    # 1. Base priority by publisher tier
    if "openai" in publisher:
        score = 10
    elif "anthropic" in publisher:
        score = 20
    elif "meta" in publisher:
        score = 30
    elif "deepseek" in publisher:
        score = 40
    elif "mistral" in publisher:
        score = 50
    elif "cohere" in publisher:
        score = 60
    elif "microsoft" in publisher:
        score = 70
    elif "google" in publisher:
        score = 80
    else:
        score = 100
        
    # 2. Adjust by specific model tier/capabilities
    # Boost top-tier flagship models
    if "gpt-4o" in name:
        score -= 9  # Top priority (Net: 1)
    elif "gpt-4" in name:
        score -= 5
    elif "claude-3-5-sonnet" in name:
        score -= 5
    elif "llama-3.1-405b" in name or "llama-3.3-70b" in name:
        score -= 5
    elif "deepseek-v3" in name:
        score -= 5
    elif "mistral-large" in name:
        score -= 5
    elif "command-r-plus" in name:
        score -= 5
        
    # Penalize smaller/efficiency models slightly in default ordering
    if "mini" in name or "small" in name or "nano" in name or "math" in name:
        score += 10
        
    return max(1, score)


def get_github_model_ids() -> List[str]:
    """Get list of available GitHub model IDs, sorted by priority"""
    if _GITHUB_MODELS_CACHE:
        return [m["id"] for m in _GITHUB_MODELS_CACHE]
    return list(_GITHUB_MODELS_MAP.keys())

def get_github_model_info(model_id: str) -> Optional[Dict[str, Any]]:
    """Get info for a specific GitHub model"""
    return _GITHUB_MODELS_MAP.get(model_id)
