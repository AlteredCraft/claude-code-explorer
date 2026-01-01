"""Plugins routes for Claude Explorer API.

Plugins are installed extensions from marketplaces. The plugin registry
tracks installation metadata including version, scope, and provided skills.
"""

import json
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Path

from ..models import Plugin
from ..utils import get_claude_dir

router = APIRouter(prefix="/plugins", tags=["plugins"])


async def get_installed_plugins() -> list[dict]:
    """Get list of installed plugins from installed_plugins.json."""
    claude_dir = get_claude_dir()
    plugins_file = claude_dir / "plugins" / "installed_plugins.json"

    if not plugins_file.exists():
        return []

    try:
        data = json.loads(plugins_file.read_text())
        return data if isinstance(data, list) else []
    except Exception:
        return []


async def get_plugin_skills(plugin_name: str, install_path: str | None) -> list[str]:
    """Get skills provided by a plugin."""
    skills = []

    if not install_path:
        return skills

    from pathlib import Path

    plugin_path = Path(install_path)
    skills_dir = plugin_path / "skills"

    if skills_dir.exists():
        for entry in skills_dir.iterdir():
            if entry.is_dir():
                skills.append(entry.name)

    return skills


@router.get("/")
async def list_plugins() -> dict[str, list[Plugin]]:
    """List all installed plugins.

    Each plugin includes metadata from the registry and a list of
    skills provided by the plugin.

    Plugin names use format: plugin-name@marketplace
    (e.g., 'artifact-workflow@alteredcraft-plugins').

    Returns:
        data: List of Plugin objects with name, version, scope, installPath,
              installedAt, gitCommitSha, and skills
    """
    plugins = await get_installed_plugins()

    result = []
    for p in plugins:
        plugin = {
            "name": p.get("name", ""),
            "version": p.get("version", ""),
            "scope": p.get("scope"),
            "installPath": p.get("installPath"),
            "installedAt": p.get("installedAt"),
            "gitCommitSha": p.get("gitCommitSha"),
        }

        # Find skills for this plugin
        plugin["skills"] = await get_plugin_skills(plugin["name"], plugin.get("installPath"))
        result.append(plugin)

    return {"data": result}


@router.get("/{name}", response_model=Plugin)
async def get_plugin(
    name: str = Path(
        description="Plugin identifier in format 'plugin-name@marketplace' (e.g., 'artifact-workflow@alteredcraft-plugins')"
    )
) -> Plugin:
    """Get a specific plugin's details.

    Returns plugin metadata including version, installation scope,
    file path, install timestamp, git commit, and provided skills.

    Args:
        name: Plugin identifier (URL-encoded if contains special characters)

    Returns:
        Plugin object with full metadata and skills list

    Raises:
        404: Plugin not found
    """
    name = unquote(name)
    plugins = await get_installed_plugins()

    for p in plugins:
        if p.get("name") == name:
            plugin = {
                "name": p.get("name", ""),
                "version": p.get("version", ""),
                "scope": p.get("scope"),
                "installPath": p.get("installPath"),
                "installedAt": p.get("installedAt"),
                "gitCommitSha": p.get("gitCommitSha"),
            }
            plugin["skills"] = await get_plugin_skills(name, p.get("installPath"))
            return plugin

    raise HTTPException(status_code=404, detail="Plugin not found")
