"""Correlated data routes for Claude Explorer API."""

import json
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException

from ..models import (
    CorrelatedData,
    FileBackupContent,
    FileHistoryEntry,
    SubAgentResponse,
    TodoItem,
)
from ..utils import get_claude_dir, parse_jsonl_file

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
                    backup_file_name = backup.get("backupFileName", "")
                    key = f"{file_path}:{backup_file_name}"

                    if key not in seen_backups:
                        seen_backups.add(key)
                        entries.append({
                            "filePath": file_path,
                            "backupFileName": backup_file_name,
                            "version": backup.get("version", 1),
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


async def find_sub_agent_sessions(session_id: str) -> dict:
    """Find sub-agent sessions for a given session."""
    claude_dir = get_claude_dir()
    projects_dir = claude_dir / "projects"
    is_agent_session = session_id.startswith("agent-")

    parent_session_id = None
    sub_agents = []

    if not projects_dir.exists():
        return {"parentSessionId": parent_session_id, "subAgents": sub_agents}

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        session_files = [f.name for f in project_dir.iterdir() if f.suffix == ".jsonl"]

        # Check if this session exists in this project
        if f"{session_id}.jsonl" not in session_files:
            continue

        # Found the project containing this session
        decoded_path = "/" + project_dir.name.replace("-", "/")

        if is_agent_session:
            # For agent sessions, find potential parent (non-agent sessions)
            main_sessions = [f for f in session_files if not f.startswith("agent-")]
            if main_sessions:
                parent_session_id = main_sessions[0].replace(".jsonl", "")
        else:
            # For main sessions, find all agent sessions in the same project
            agent_files = [f for f in session_files if f.startswith("agent-")]

            for agent_file in agent_files:
                agent_id = agent_file.replace(".jsonl", "")
                agent_path = project_dir / agent_file

                try:
                    content = agent_path.read_text()
                    lines = parse_jsonl_file(content)
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
                            if parsed.get("type") == "assistant" and not model:
                                model = parsed.get("model")

                    from datetime import datetime

                    sub_agents.append({
                        "id": agent_id,
                        "projectPath": decoded_path,
                        "startTime": start_time or datetime.now().isoformat(),
                        "endTime": end_time,
                        "messageCount": message_count,
                        "model": model,
                        "isAgent": True,
                    })
                except Exception:
                    continue

        break  # Found the project, no need to continue

    return {"parentSessionId": parent_session_id, "subAgents": sub_agents}


@router.get("/{session_id}/correlated")
async def get_correlated(session_id: str):
    """Get all correlated data for a session."""
    todos = await find_session_todos(session_id)
    file_history = await find_session_file_history(session_id)
    debug_logs = await find_session_debug_logs(session_id)
    linked_plan = await find_linked_plan(session_id)
    linked_skill = await find_linked_skill(session_id)

    return {
        "todos": todos,
        "fileHistory": file_history,
        "debugLogs": debug_logs,
        "linkedPlan": linked_plan,
        "linkedSkill": linked_skill,
    }


@router.get("/{session_id}/todos")
async def get_todos(session_id: str):
    """Get todos for a session."""
    todos = await find_session_todos(session_id)
    return {"data": todos}


@router.get("/{session_id}/file-history")
async def get_file_history(session_id: str):
    """Get file history for a session."""
    file_history = await find_session_file_history(session_id)
    return {"data": file_history}


@router.get("/{session_id}/file-history/{backup_file_name}")
async def get_file_backup(session_id: str, backup_file_name: str):
    """Get content of a backup file."""
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


@router.get("/{session_id}/sub-agents")
async def get_sub_agents(session_id: str):
    """Get sub-agent sessions."""
    result = await find_sub_agent_sessions(session_id)
    return result


@router.get("/{session_id}/environment")
async def get_environment(session_id: str):
    """Get session environment variables."""
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
async def get_debug_logs(session_id: str):
    """Get debug logs for a session."""
    debug_logs = await find_session_debug_logs(session_id)
    return {"data": debug_logs}
