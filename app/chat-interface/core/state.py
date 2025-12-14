import asyncio
from typing import Dict, Set

# Request queueing: limit concurrent requests per model to prevent overload
# Semaphores are populated at startup based on each model's reported capacity
# Models expose their max_concurrent via /health/details endpoint
MODEL_SEMAPHORES: Dict[str, asyncio.Semaphore] = {}

# Cache for configured capacities (max_concurrent) for each model
MODEL_CAPACITIES: Dict[str, int] = {}

# Cache for live context lengths fetched from inference servers
# Keys are model IDs, values are the actual n_ctx the server is running with
LIVE_CONTEXT_LENGTHS: Dict[str, int] = {}

# Cache of GitHub Models that returned "unknown_model".
# Prevents repeated network calls/log spam for invalid IDs.
UNSUPPORTED_GITHUB_MODELS: Set[str] = set()
