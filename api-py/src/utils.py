"""Utility functions for Claude Explorer API."""

import json
import re
from pathlib import Path
from datetime import datetime
from typing import Any


def get_claude_dir() -> Path:
    """Get the path to the ~/.claude directory."""
    return Path.home() / ".claude"


def get_claude_config_path() -> Path:
    """Get the path to the ~/.claude.json config file."""
    return Path.home() / ".claude.json"


def decode_project_path(encoded: str) -> str:
    """Decode a project path from the encoded format."""
    if encoded.startswith("-"):
        return "/" + encoded[1:].replace("-", "/")
    return encoded.replace("-", "/")


def encode_project_path(path: str) -> str:
    """Encode a project path to match Claude Code's directory naming.

    Claude Code replaces all non-alphanumeric characters with -.
    """
    return re.sub(r"[^a-zA-Z0-9]", "-", path)


def get_display_path(path: str) -> str:
    """Get a display-friendly path with ~ for home directory."""
    home = str(Path.home())
    if path.startswith(home):
        return "~" + path[len(home):]
    return path


def get_project_name(path: str) -> str:
    """Extract the project name from a path."""
    parts = path.split("/")
    return parts[-1] if parts else path


async def get_claude_config() -> dict[str, Any]:
    """Read and parse the ~/.claude.json config file."""
    try:
        config_path = get_claude_config_path()
        content = config_path.read_text()
        return json.loads(content)
    except Exception:
        return {}


def build_path_lookup(config: dict[str, Any]) -> dict[str, str]:
    """Build a lookup table from encoded paths to real paths."""
    lookup = {}
    projects = config.get("projects", {})
    for real_path in projects.keys():
        encoded = encode_project_path(real_path)
        lookup[encoded] = real_path
    return lookup


def extract_cwd_from_project_dir(project_dir: Path) -> str | None:
    """Extract cwd from agent files in an orphan project directory.

    For directories not in config, agent files contain a `cwd` field with
    the actual working directory. This provides accurate paths when the
    encoded directory name can't be reliably decoded.

    Returns the cwd from the first agent file found, or None if not available.
    """
    for agent_file in project_dir.glob("agent-*.jsonl"):
        try:
            with open(agent_file) as f:
                first_line = f.readline()
                if first_line:
                    entry = json.loads(first_line)
                    if cwd := entry.get("cwd"):
                        return cwd
        except (json.JSONDecodeError, OSError):
            continue
    return None


def parse_jsonl_file(content: str) -> list[dict[str, Any]]:
    """Parse a JSONL file content into a list of dictionaries."""
    lines = content.strip().split("\n")
    results = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            results.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return results


def parse_timestamp(timestamp: str | int | float | None) -> datetime | None:
    """Parse various timestamp formats into a datetime object."""
    if timestamp is None:
        return None

    if isinstance(timestamp, (int, float)):
        # Unix timestamp in milliseconds
        if timestamp > 1e12:
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp)

    if isinstance(timestamp, str):
        try:
            # ISO format
            return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            pass
        try:
            # Unix timestamp as string
            ts = float(timestamp)
            if ts > 1e12:
                ts = ts / 1000
            return datetime.fromtimestamp(ts)
        except ValueError:
            pass

    return None


def parse_yaml_frontmatter(content: str) -> dict[str, Any]:
    """Parse YAML frontmatter from a markdown file."""
    match = re.match(r"^---\s*\n([\s\S]*?)\n---", content)
    if not match:
        return {}

    frontmatter = match.group(1)
    result = {}

    desc_match = re.search(r"^description:\s*(.+)$", frontmatter, re.MULTILINE)
    if desc_match:
        result["description"] = desc_match.group(1).strip()

    tools_match = re.search(r"^allowed-tools:\s*(.+)$", frontmatter, re.MULTILINE)
    if tools_match:
        result["allowed_tools"] = tools_match.group(1).strip().split()

    return result


def parse_shell_snapshot_filename(filename: str) -> dict[str, Any]:
    """Parse snapshot filename: snapshot-{shell}-{timestamp}-{random}.sh."""
    match = re.match(r"^snapshot-(\w+)-(\d+)-\w+\.sh$", filename)
    if match:
        return {
            "filename": filename,
            "shell": match.group(1),
            "timestamp": int(match.group(2)),
        }
    return {"filename": filename}
