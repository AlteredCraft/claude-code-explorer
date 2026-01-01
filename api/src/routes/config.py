"""Config routes for Claude Explorer API.

Provides read-only access to Claude Code configuration:
- Main config: User preferences, OAuth, MCP servers, project settings
- User settings: Permissions, hooks, model selection
"""

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
async def get_config() -> ClaudeConfig:
    """Get Claude configuration with sensitive data redacted.

    OAuth tokens, API keys, and other sensitive fields are replaced
    with '[REDACTED]'.

    Includes:
    - User preferences (theme, notifications)
    - MCP server configurations
    - Per-project settings (allowedTools, lastSessionId, costs)
    - Feature flags (with sensitive values redacted)

    Returns:
        ClaudeConfig object (dynamic fields allowed)
    """
    try:
        config_path = get_claude_config_path()
        content = config_path.read_text()
        config = json.loads(content)
        return redact_sensitive_data(config)
    except Exception:
        return {}


@router.get("/settings", response_model=ClaudeSettings)
async def get_settings() -> ClaudeSettings:
    """Get user settings.

    Settings control:
    - permissions: Tool allow/deny rules
    - model: Default Claude model selection
    - hooks: UserPromptSubmit, PreToolUse, PostToolUse, Stop handlers
    - statusLine: Custom status line configuration
    - enabledPlugins: Per-plugin enable/disable
    - alwaysThinkingEnabled: Extended thinking default

    Returns:
        ClaudeSettings object (dynamic fields allowed)
    """
    try:
        claude_dir = get_claude_dir()
        settings_path = claude_dir / "settings.json"
        content = settings_path.read_text()
        return json.loads(content)
    except Exception:
        return {}
