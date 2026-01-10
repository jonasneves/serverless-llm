import logging
import re

logger = logging.getLogger(__name__)


def sanitize_error_message(error_text: str, endpoint: str = "") -> str:
    """
    Sanitize error messages to hide raw HTML/technical details from users.
    Logs full details server-side.
    """
    logger.error(f"Model error from {endpoint}: {error_text[:500]}...")

    error_lower = (error_text or "").lower()

    # Handle unsupported parameter errors (API compatibility issues)
    if "unsupported parameter" in error_lower or "unsupported_parameter" in error_lower:
        return "API parameter error. This model may require different request parameters. Please try another model or contact support."

    # Handle rate limiting (429)
    if "429" in error_text or "too many requests" in error_lower or "rate limit" in error_lower:
        is_github_api = "github" in endpoint.lower()
        if is_github_api:
            return "⏱️ GitHub Models rate limit reached. Using the free quota has limits. Try again in a few moments, or add your own GitHub token in Settings for higher quota."
        return "Rate limit exceeded. Please wait a moment before trying again."

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

    # Handle 404 Not Found for GitHub Models
    if "404" in error_text and "github" in endpoint.lower():
        return "Model not found. This model may not be available via GitHub Models API, or your token doesn't have access to it."

    clean_text = re.sub(r"<[^>]+>", "", error_text or "")
    clean_text = re.sub(r"\s+", " ", clean_text).strip()

    if len(clean_text) > 200:
        return clean_text[:200] + "..."

    return clean_text if clean_text else "An unexpected error occurred."


def create_error_event(error: Exception, context: str = None, model_id: str = None) -> dict:
    """
    Create a standardized error event dictionary.

    Args:
        error: The exception that occurred
        context: Optional context string describing where the error occurred
        model_id: Optional model ID that caused the error

    Returns:
        Dictionary with standardized error event structure
    """
    event = {
        "type": "error",
        "event": "error",
        "error": sanitize_error_message(str(error), context or "")
    }

    if context:
        event["context"] = context

    if model_id:
        event["model_id"] = model_id

    return event

