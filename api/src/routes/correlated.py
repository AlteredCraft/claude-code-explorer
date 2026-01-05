"""Correlated data routes for Claude Explorer API.

Provides access to data correlated by Session UUID across directories.
The session UUID is the universal key linking: transcripts, file backups,
todos, environment variables, and debug logs.
"""

import json
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException
from fastapi import Path as PathParam

from ..models import (
    FileBackupContent,
    FilesChangedResponse,
    TodoItem,
)
from ..utils import get_claude_dir, get_parent_session_id, parse_jsonl_file

router = APIRouter(prefix="/sessions", tags=["correlated"])


async def find_session_transcript(session_id: str) -> Path | None:
    """Find session transcript file by scanning project directories."""
    claude_dir = get_claude_dir()
    projects_dir = claude_dir / "projects"

    if not projects_dir.exists():
        return None

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        # Check for exact session file
        session_file = project_dir / f"{session_id}.jsonl"
        if session_file.exists():
            return session_file

    return None


async def find_session_todos(session_id: str) -> list[dict]:
    """Find todos for a session."""
    claude_dir = get_claude_dir()
    todos_dir = claude_dir / "todos"
    todos = []

    if not todos_dir.exists():
        return todos

    for entry in todos_dir.iterdir():
        if not entry.name.startswith(session_id):
            continue

        if entry.is_file() and entry.suffix == ".json":
            try:
                data = json.loads(entry.read_text())
                if isinstance(data.get("todos"), list):
                    todos.extend(data["todos"])
                elif data.get("content") and data.get("status"):
                    todos.append(data)
            except Exception:
                continue
        elif entry.is_dir():
            for sub_file in entry.iterdir():
                if sub_file.suffix == ".json":
                    try:
                        data = json.loads(sub_file.read_text())
                        if isinstance(data.get("todos"), list):
                            todos.extend(data["todos"])
                        elif data.get("content") and data.get("status"):
                            todos.append(data)
                    except Exception:
                        continue

    return todos


async def find_session_file_history(session_id: str) -> list[dict]:
    """Find file history for a session."""
    claude_dir = get_claude_dir()
    entries = []
    seen_backups = set()

    # First, try to find file-history-snapshot messages from session transcript
    try:
        session_transcript = await find_session_transcript(session_id)
        if session_transcript:
            content = session_transcript.read_text()
            lines = parse_jsonl_file(content)

            for parsed in lines:
                if parsed.get("type") != "file-history-snapshot":
                    continue
                snapshot = parsed.get("snapshot", {})
                tracked_backups = snapshot.get("trackedFileBackups", {})
                message_id = parsed.get("messageId") or snapshot.get("messageId")
                timestamp = snapshot.get("timestamp")

                for file_path, backup in tracked_backups.items():
                    backup_file_name = backup.get("backupFileName")  # Can be None for created files
                    version = backup.get("version", 1)
                    # Include version in key to track multiple versions of same file
                    key = f"{file_path}:{backup_file_name or 'null'}:{version}"

                    if key not in seen_backups:
                        seen_backups.add(key)
                        entries.append({
                            "filePath": file_path,
                            "backupFileName": backup_file_name,  # None for newly created files
                            "version": version,
                            "backupTime": backup.get("backupTime") or timestamp,
                            "messageId": message_id,
                        })
    except Exception:
        pass

    # Also list any backup files directly in file-history/{sessionId}/
    file_history_dir = claude_dir / "file-history" / session_id
    if file_history_dir.exists():
        import re

        for file in file_history_dir.iterdir():
            # Backup files have format: {hash}@v{version}
            match = re.match(r"^(.+)@v(\d+)$", file.name)
            if match:
                backup_file_name = file.name
                version = int(match.group(2))

                # Check if we already have this backup from transcript parsing
                existing = [e for e in entries if e["backupFileName"] == backup_file_name]
                if not existing:
                    entries.append({
                        "filePath": f"(unknown - {match.group(1)})",
                        "backupFileName": backup_file_name,
                        "version": version,
                    })

    # Sort by file path, then version
    entries.sort(key=lambda e: (e.get("filePath", ""), e.get("version", 0)))
    return entries


async def find_session_debug_logs(session_id: str) -> list[str]:
    """Find debug logs for a session."""
    claude_dir = get_claude_dir()
    debug_dir = claude_dir / "debug"
    logs = []

    if not debug_dir.exists():
        return logs

    for file in debug_dir.iterdir():
        if session_id in file.name or file.name.startswith(session_id[:8]):
            try:
                content = file.read_text()
                logs.append(content[:5000])
            except Exception:
                continue

        if len(logs) >= 5:
            break

    return logs


async def find_linked_plan(session_id: str) -> str | None:
    """Find a plan linked to a session."""
    claude_dir = get_claude_dir()
    plans_dir = claude_dir / "plans"

    if not plans_dir.exists():
        return None

    for file in plans_dir.iterdir():
        if file.suffix == ".md":
            try:
                content = file.read_text()
                if session_id in content:
                    return file.name
            except Exception:
                continue

    return None


async def find_linked_skill(session_id: str) -> str | None:
    """Find a skill linked to a session."""
    # TODO: Detect skill usage from session messages
    return None


async def find_sub_agent_sessions(
    session_id: str, project_dir: Path | None = None
) -> dict:
    """Find sub-agent sessions for a given session.

    Uses the sessionId field in sub-agent messages to establish parent-child
    relationships, not just filename pattern matching.

    Args:
        session_id: The parent session UUID to find sub-agents for
        project_dir: Optional project directory path (skips directory scan if provided)

    Returns:
        Dict with parentSessionId (if this is a sub-agent) and subAgents list
    """
    from datetime import datetime

    claude_dir = get_claude_dir()
    projects_dir = claude_dir / "projects"
    is_agent_session = session_id.startswith("agent-")

    parent_session_id = None
    sub_agents = []

    if not projects_dir.exists():
        return {"parentSessionId": parent_session_id, "subAgents": sub_agents}

    # Find the project directory if not provided
    if project_dir is None:
        for dir_entry in projects_dir.iterdir():
            if not dir_entry.is_dir():
                continue
            if (dir_entry / f"{session_id}.jsonl").exists():
                project_dir = dir_entry
                break

    if project_dir is None:
        return {"parentSessionId": parent_session_id, "subAgents": sub_agents}

    decoded_path = "/" + project_dir.name.replace("-", "/")

    if is_agent_session:
        # For agent sessions, use shared helper to get parent sessionId
        parent_session_id = get_parent_session_id(project_dir, session_id)
    else:
        # For main sessions, find all agent files that reference this session
        agent_files = [f for f in project_dir.iterdir()
                      if f.suffix == ".jsonl" and f.name.startswith("agent-")]

        for agent_file in agent_files:
            agent_id = agent_file.stem  # e.g., "agent-a6e31e7"
            agent_path = agent_file

            try:
                content = agent_path.read_text()
                lines = parse_jsonl_file(content)
                if not lines:
                    continue

                # Check if this agent belongs to this session via sessionId field
                first_msg = lines[0]
                agent_parent_session_id = first_msg.get("sessionId")

                if agent_parent_session_id != session_id:
                    continue  # This agent belongs to a different session

                # Parse agent session details
                message_count = 0
                start_time = None
                end_time = None
                model = None

                for parsed in lines:
                    if parsed.get("type") in ("user", "assistant"):
                        message_count += 1
                        if not start_time and parsed.get("timestamp"):
                            start_time = parsed["timestamp"]
                        end_time = parsed.get("timestamp")
                        if parsed.get("type") == "assistant":
                            msg = parsed.get("message", {})
                            if isinstance(msg, dict) and msg.get("model"):
                                model = msg["model"]

                sub_agents.append({
                    "id": agent_id,
                    "projectPath": decoded_path,
                    "startTime": start_time or datetime.now().isoformat(),
                    "endTime": end_time,
                    "messageCount": message_count,
                    "model": model,
                    "isSubAgent": True,
                    "parentSessionId": session_id,
                    "subAgentIds": None,
                })
            except Exception:
                continue

    return {"parentSessionId": parent_session_id, "subAgents": sub_agents}


@router.get("/{session_id}/todos")
async def get_todos(
    session_id: str = PathParam(
        description="Session UUID to retrieve todos for"
    )
) -> dict[str, list[TodoItem]]:
    """Get todos for a session.

    Returns task items for the session. The agentId may equal sessionId
    (main session) or differ (sub-agent).

    Todo items have:
    - content: Task description text
    - status: 'pending', 'in_progress', or 'completed'

    Returns:
        data: List of TodoItem objects
    """
    todos = await find_session_todos(session_id)
    return {"data": todos}


@router.get("/{session_id}/files-changed")
async def get_files_changed(
    session_id: str = PathParam(
        description="Session UUID to retrieve file changes for"
    )
) -> FilesChangedResponse:
    """Get files created or modified during a session.

    Derives file change type from backupFileName:
    - null at v1 = file was created (didn't exist before)
    - present at v1 = file was modified (had prior content)

    Returns:
        FilesChangedResponse with summary counts and per-file details
    """
    file_history = await find_session_file_history(session_id)

    # Group entries by file path
    files_by_path: dict[str, list[dict]] = {}
    for entry in file_history:
        path = entry["filePath"]
        if path not in files_by_path:
            files_by_path[path] = []
        files_by_path[path].append(entry)

    files = []
    created_count = 0
    modified_count = 0

    for path, entries in files_by_path.items():
        # Sort by version to find v1
        sorted_entries = sorted(entries, key=lambda e: e.get("version", 0))
        v1 = sorted_entries[0] if sorted_entries else None

        # Created if v1 has no backupFileName (file didn't exist before)
        is_created = v1 is not None and v1.get("backupFileName") is None
        action = "created" if is_created else "modified"

        if is_created:
            created_count += 1
        else:
            modified_count += 1

        # Build backups array for content retrieval
        backups = [
            {
                "backupFileName": e.get("backupFileName"),
                "version": e.get("version", 0),
                "backupTime": e.get("backupTime"),
            }
            for e in sorted_entries
        ]

        files.append({
            "path": path,
            "action": action,
            "backups": backups,
        })

    # Sort files by path for consistent output
    files.sort(key=lambda f: f["path"])

    return {
        "sessionId": session_id,
        "summary": {
            "created": created_count,
            "modified": modified_count,
            "totalFiles": len(files),
        },
        "files": files,
    }


@router.get("/{session_id}/file-history/{backup_file_name}")
async def get_file_backup(
    session_id: str = PathParam(
        description="Session UUID the backup belongs to"
    ),
    backup_file_name: str = PathParam(
        description="Backup filename in format {hash}@v{version} (e.g., '59e0b9c43163e850@v1')"
    )
) -> FileBackupContent:
    """Get content of a specific file backup.

    Retrieves the raw file content from the session's file history.

    Args:
        session_id: Session UUID
        backup_file_name: Backup filename (URL-encoded if necessary)

    Returns:
        FileBackupContent with backupFileName, content, and size in bytes

    Raises:
        400: Invalid backup file path (path traversal attempt)
        404: Backup file not found
    """
    backup_file_name = unquote(backup_file_name)
    claude_dir = get_claude_dir()
    backup_path = claude_dir / "file-history" / session_id / backup_file_name

    # Security check
    if not str(backup_path).startswith(str(claude_dir / "file-history")):
        raise HTTPException(status_code=400, detail="Invalid backup file path")

    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")

    content = backup_path.read_text()
    size = backup_path.stat().st_size

    return {
        "backupFileName": backup_file_name,
        "content": content,
        "size": size,
    }


@router.get("/{session_id}/environment")
async def get_environment(
    session_id: str = PathParam(
        description="Session UUID to retrieve environment variables for"
    )
) -> dict[str, dict[str, str]]:
    """Get session environment variables.

    Returns environment variables captured for this session.
    Each file in the session's environment directory contains KEY=value pairs.

    Returns:
        data: Dictionary of environment variable name to value
    """
    claude_dir = get_claude_dir()
    env_dir = claude_dir / "session-env" / session_id
    env = {}

    if env_dir.exists():
        for file in env_dir.iterdir():
            try:
                content = file.read_text()
                for line in content.split("\n"):
                    if "=" in line:
                        key, value = line.split("=", 1)
                        env[key] = value
            except Exception:
                continue

    return {"data": env}


@router.get("/{session_id}/debug-logs")
async def get_debug_logs(
    session_id: str = PathParam(
        description="Session UUID to retrieve debug logs for"
    )
) -> dict[str, list[str]]:
    """Get debug logs for a session.

    Returns debug log content for this session and any files containing
    the session ID in their name.

    Logs are truncated to 5KB each, with a maximum of 5 log files returned.

    Returns:
        data: List of debug log content strings
    """
    debug_logs = await find_session_debug_logs(session_id)
    return {"data": debug_logs}
