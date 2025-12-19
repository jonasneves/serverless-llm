import time
from core.config import MODEL_ENDPOINTS
from core.state import MODEL_SEMAPHORES, MODEL_CAPACITIES

def get_load_balancer_status():
    """
    Get the current status of the load balancer, showing capacity and utilization per model.
    """
    status = {}
    for model_id, semaphore in MODEL_SEMAPHORES.items():
        endpoint = MODEL_ENDPOINTS.get(model_id, "unknown")
        configured_capacity = MODEL_CAPACITIES.get(model_id, 1)
        # Access internal _value to see current count
        available_slots = getattr(semaphore, '_value', 0)
        active_requests = max(0, configured_capacity - available_slots)

        status[model_id] = {
            "endpoint": endpoint,
            "configured_capacity": configured_capacity,
            "active_requests": active_requests,
            "available_slots": available_slots,
            "utilization_percent": round(
                (active_requests / configured_capacity * 100)
                if configured_capacity > 0 else 0,
                1
            )
        }

    return {
        "timestamp": time.time(),
        "models": status,
        "total_capacity": sum(s["configured_capacity"] for s in status.values()),
        "total_active": sum(s["active_requests"] for s in status.values()),
        "total_available": sum(s["available_slots"] for s in status.values()),
    }
