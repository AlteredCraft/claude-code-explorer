"""Config routes for Claude Explorer API."""

import json
from typing import Any

from fastapi import APIRouter

from ..models import ClaudeConfig, ClaudeSettings
from ..utils import get_claude_config_path, get_claude_dir

router = APIRouter(prefix="/config", tags=["config"])

# Sensitive fields to redact from config
SENSITIVE_FIELDS = [
    "oauthaccount",
    "accesstoken",
    "refreshtoken",
    "apikey",
    "credentials",
    "token",
    "secret",
]


def redact_sensitive_data(obj: dict[str, Any]) -> dict[str, Any]:
    """Redact sensitive data from a dictionary."""
    result = {}

    for key, value in obj.items():
        # Check if key is sensitive
        is_sensitive = any(field in key.lower() for field in SENSITIVE_FIELDS)

        if is_sensitive:
            result[key] = "[REDACTED]"
        elif isinstance(value, dict):
            result[key] = redact_sensitive_data(value)
        else:
            result[key] = value

    return result


@router.get("/", response_model=ClaudeConfig)
async def get_config():
    """Get Claude configuration (sensitive data redacted)."""
    try:
        config_path = get_claude_config_path()
        content = config_path.read_text()
        config = json.loads(content)
        return redact_sensitive_data(config)
    except Exception:
        return {}


@router.get("/settings", response_model=ClaudeSettings)
async def get_settings():
    """Get user settings."""
    try:
        claude_dir = get_claude_dir()
        settings_path = claude_dir / "settings.json"
        content = settings_path.read_text()
        return json.loads(content)
    except Exception:
        return {}
