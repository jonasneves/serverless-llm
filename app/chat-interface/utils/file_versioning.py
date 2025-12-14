"""
Utility functions for static file versioning and cache busting
"""

import hashlib
import pathlib
from typing import Dict, Tuple


# Cache file versions based on content hash for automatic cache busting
FILE_VERSIONS: Dict[str, Tuple[float, str]] = {}


def get_file_version(filename: str, static_dir: pathlib.Path) -> str:
    """
    Generate a cache-busting version string for a file based on its content hash.
    Returns an 8-character MD5 hash that changes whenever file content changes.
    """
    file_path = static_dir / filename

    # Return cached version if file hasn't changed
    if filename in FILE_VERSIONS:
        cached_mtime, cached_version = FILE_VERSIONS[filename]
        try:
            current_mtime = file_path.stat().st_mtime
            if current_mtime == cached_mtime:
                return cached_version
        except FileNotFoundError:
            return "1"

    # Calculate new version from file content hash
    try:
        content = file_path.read_bytes()
        file_hash = hashlib.md5(content).hexdigest()[:8]  # First 8 chars of hash
        FILE_VERSIONS[filename] = (file_path.stat().st_mtime, file_hash)
        return file_hash
    except FileNotFoundError:
        return "1"


def get_static_versions(static_dir: pathlib.Path) -> dict:
    """Get all static file versions for template injection"""
    def get_version(filename: str) -> str:
        return get_file_version(filename, static_dir)

    return {
        "design_tokens_css": get_version("design-tokens.css"),
        "reset_css": get_version("reset.css"),
        "typography_css": get_version("typography.css"),
        "layout_css": get_version("layout.css"),
        "navigation_css": get_version("components/navigation.css"),
        "buttons_css": get_version("components/buttons.css"),
        "cards_css": get_version("components/cards.css"),
        "forms_css": get_version("components/forms.css"),
        "badges_css": get_version("components/badges.css"),
        "model_selector_css": get_version("components/model-selector.css"),
        "modals_css": get_version("components/modals.css"),
        "common_css": get_version("common.css"),
        "chat_css": get_version("chat.css"),
        "settings_js": get_version("settings.js"),
        "content_formatter_js": get_version("content-formatter.js"),
        "chat_js": get_version("chat.js"),
        "orchestrator_js": get_version("orchestrator.js"),
        "verbalized_sampling_js": get_version("verbalized_sampling.js"),
        "confessions_js": get_version("confessions.js"),
        "model_loader_js": get_version("model-loader.js"),
        "model_selector_js": get_version("model-selector.js"),
    }
