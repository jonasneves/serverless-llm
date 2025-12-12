import logging
import re

logger = logging.getLogger(__name__)


def sanitize_error_message(error_text: str, endpoint: str = "") -> str:
    """
    Sanitize error messages to hide raw HTML/technical details from users.
    Logs full details server-side.
    """
    try:
        logger.error(f"Model error from {endpoint}: {error_text[:500]}...")
    except Exception:
        pass

    error_lower = (error_text or "").lower()

    if "cloudflare" in error_lower or "<!doctype" in error_lower or "<html" in error_lower:
        return "Service temporarily unavailable. The model server may be down or experiencing issues."

    if "timeout" in error_lower:
        return "Request timed out. Please try again."

    if "connection refused" in error_lower or "connect error" in error_lower:
        return "Cannot connect to model server. Please try again later."

    if "502" in error_text or "503" in error_text or "504" in error_text:
        return "Model server is temporarily unavailable."

    if "520" in error_text or "521" in error_text or "522" in error_lower:
        return "Service temporarily unavailable (CDN error)."

    clean_text = re.sub(r"<[^>]+>", "", error_text or "")
    clean_text = re.sub(r"\s+", " ", clean_text).strip()

    if len(clean_text) > 200:
        return clean_text[:200] + "..."

    return clean_text if clean_text else "An unexpected error occurred."

