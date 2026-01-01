"""Projects and Sessions routes for Claude Explorer API.

Core routes for listing projects and sessions, viewing messages, and
accessing project activity timelines. Projects are identified by their
filesystem path with sessions stored as JSONL transcripts.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Literal
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query
from fastapi import Path as PathParam

from ..models import (
    ActivityResponse,
    ActivitySummaryStats,
    CorrelatedData,
    DailyProjectActivity,
    FileHistoryEntry,
    Message,
    MessageContent,
    PaginatedResponse,
    PaginationMeta,
    Project,
    ProjectDetail,
    Session,
    SessionDetail,
    SessionMetadata,
    TodoItem,
)
from ..utils import (
    build_path_lookup,
    decode_project_path,
    encode_project_path,
    extract_cwd_from_project_dir,
    get_claude_config,
    get_claude_dir,
    get_display_path,
    get_project_name,
    normalize_path_prefix,
    parse_jsonl_file,
    parse_timestamp,
)

router = APIRouter(prefix="/projects", tags=["projects"])


async def get_session_files(encoded_project_path: str) -> list[dict]:
    """Get session files for a project, sorted by modification time."""
    claude_dir = get_claude_dir()
    project_dir = claude_dir / "projects" / encoded_project_path

    if not project_dir.exists():
        return []

    files = []
    for f in project_dir.iterdir():
        if f.suffix == ".jsonl":
            stat = f.stat()
            files.append({"name": f.name, "mtime": datetime.fromtimestamp(stat.st_mtime)})

    files.sort(key=lambda x: x["mtime"], reverse=True)
    return files


async def get_session_bounds(
    encoded_project_path: str, filename: str
) -> dict:
    """Get session time bounds and message count."""
    claude_dir = get_claude_dir()
    file_path = claude_dir / "projects" / encoded_project_path / filename

    try:
        content = file_path.read_text()
        lines = parse_jsonl_file(content)

        start_time = None  # Don't default to now - remain undetermined if no timestamps
        end_time = None
        message_count = 0
        model = None

        for i, parsed in enumerate(lines):
            if parsed.get("type") == "file-history-snapshot":
                continue
            message_count += 1

            timestamp = parse_timestamp(parsed.get("timestamp"))
            if timestamp:
                if start_time is None:  # First valid timestamp = start
                    start_time = timestamp
                end_time = timestamp  # Last valid timestamp = end
            if parsed.get("type") == "assistant":
                msg = parsed.get("message", {})
                if msg.get("model"):
                    model = msg["model"]

        return {
            "start_time": start_time,
            "end_time": end_time,
            "message_count": message_count,
            "model": model,
        }
    except Exception:
        return {"start_time": None, "end_time": None, "message_count": 0}


async def get_session_messages_raw(
    encoded_project_path: str, session_id: str
) -> list[dict]:
    """Get raw messages for a session."""
    claude_dir = get_claude_dir()
    filename = session_id if session_id.endswith(".jsonl") else f"{session_id}.jsonl"
    file_path = claude_dir / "projects" / encoded_project_path / filename

    try:
        content = file_path.read_text()
        lines = parse_jsonl_file(content)
        messages = []

        for parsed in lines:
            if not parsed.get("type") or parsed.get("type") == "file-history-snapshot":
                continue

            timestamp = parse_timestamp(parsed.get("timestamp"))
            if not timestamp:
                continue

            messages.append({
                "uuid": parsed.get("uuid") or parsed.get("messageId", ""),
                "parent_uuid": parsed.get("parentUuid"),
                "type": parsed["type"],
                "timestamp": timestamp.isoformat(),
                "session_id": parsed.get("sessionId") or session_id,
                "content": parsed.get("message", {"role": parsed["type"], "content": ""}),
                "model": parsed.get("message", {}).get("model") if isinstance(parsed.get("message"), dict) else None,
                "cwd": parsed.get("cwd"),
                "git_branch": parsed.get("gitBranch"),
            })

        return messages
    except Exception:
        return []


@router.get("/", response_model=PaginatedResponse[Project])
async def list_projects(
    sort_by: str = Query(
        "lastActivity",
        alias="sortBy",
        description="Sort field: 'lastActivity' (default), 'name', or 'sessionCount'"
    ),
    sort_order: Literal["asc", "desc"] = Query(
        "desc",
        alias="sortOrder",
        description="Sort direction: 'asc' or 'desc' (default)"
    ),
    limit: int = Query(
        50,
        le=100,
        description="Maximum number of projects per page (max 100)"
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of projects to skip for pagination"
    ),
    path_prefix: list[str] = Query(
        [],
        alias="pathPrefix",
        description="Filter to projects under these paths (supports ~ expansion). Can specify multiple."
    ),
) -> PaginatedResponse[Project]:
    """List all projects with Claude Code session data.

    Discovers projects from two sources:
    1. Session directories (encoded paths)
    2. Project entries in config

    Projects may be:
    - Normal: Has both session directory and config entry
    - Orphan: Has session directory but no config entry (isOrphan=true)
    - Config-only: Has config entry but no sessions (hasSessionData=false)

    Returns:
        data: List of Project objects with path, session count, activity info
        meta: Pagination metadata
    """
    claude_dir = get_claude_dir()
    projects_dir = claude_dir / "projects"

    if not projects_dir.exists():
        return {"data": [], "meta": {"total": 0, "limit": limit, "offset": offset, "hasMore": False}}

    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    config_projects = config.get("projects", {})

    projects = []
    for entry in projects_dir.iterdir():
        if not entry.is_dir():
            continue

        # Try config lookup first, then agent file cwd, then fallback decode
        if entry.name in path_lookup:
            decoded_path = path_lookup[entry.name]
            is_orphan = False
        else:
            # Orphan directory - try to get real path from agent files
            decoded_path = extract_cwd_from_project_dir(entry) or decode_project_path(entry.name)
            is_orphan = True

        project_config = config_projects.get(decoded_path, {})
        session_files = await get_session_files(entry.name)

        last_activity = None
        if session_files:
            last_activity = session_files[0]["mtime"].isoformat()

        projects.append({
            "path": decoded_path,
            "encodedPath": entry.name,
            "displayPath": get_display_path(decoded_path),
            "name": get_project_name(decoded_path),
            "sessionCount": len(session_files),
            "hasSessionData": True,
            "isOrphan": is_orphan,
            "lastSessionId": project_config.get("lastSessionId"),
            "lastActivity": last_activity,
            "lastCost": project_config.get("lastCost"),
            "lastDuration": project_config.get("lastDuration"),
            "lastTotalInputTokens": project_config.get("lastTotalInputTokens"),
            "lastTotalOutputTokens": project_config.get("lastTotalOutputTokens"),
        })

    # Add config-only projects (no session directory)
    seen_paths = {p["path"] for p in projects}
    for real_path, project_config in config_projects.items():
        if real_path in seen_paths:
            continue  # Already added from directory

        encoded = encode_project_path(real_path)
        if (projects_dir / encoded).exists():
            continue  # Has directory, already processed

        # Config-only project - no session data
        projects.append({
            "path": real_path,
            "encodedPath": encoded,
            "displayPath": get_display_path(real_path),
            "name": get_project_name(real_path),
            "sessionCount": 0,
            "hasSessionData": False,
            "isOrphan": False,
            "lastSessionId": project_config.get("lastSessionId"),
            "lastActivity": None,
            "lastCost": project_config.get("lastCost"),
            "lastDuration": project_config.get("lastDuration"),
            "lastTotalInputTokens": project_config.get("lastTotalInputTokens"),
            "lastTotalOutputTokens": project_config.get("lastTotalOutputTokens"),
        })

    # Filter by path prefix(es)
    if path_prefix:
        normalized_prefixes = [normalize_path_prefix(p) for p in path_prefix]
        projects = [
            p for p in projects
            if any(p["path"].startswith(prefix) for prefix in normalized_prefixes)
        ]

    # Sort
    def sort_key(p):
        if sort_by == "lastActivity":
            return p.get("lastActivity") or ""
        elif sort_by == "name":
            return p.get("name", "")
        elif sort_by == "sessionCount":
            return p.get("sessionCount", 0)
        return ""

    projects.sort(key=sort_key, reverse=(sort_order == "desc"))

    # Paginate
    total = len(projects)
    paginated = projects[offset : offset + limit]

    return {
        "data": paginated,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total,
        },
    }


@router.get("/{encoded_path}", response_model=ProjectDetail)
async def get_project(
    encoded_path: str = PathParam(
        description="URL-encoded project path (e.g., '-Users-sam-Projects-my-app')"
    )
) -> ProjectDetail:
    """Get detailed project information.

    Returns project metadata along with recent sessions and activity summary.
    The encoded path is the directory name format used for session storage.

    Args:
        encoded_path: URL-encoded project path from list_projects

    Returns:
        ProjectDetail with recentSessions (up to 10) and activitySummary

    Raises:
        404: Project directory not found
    """
    decoded_encoded_path = unquote(encoded_path)
    claude_dir = get_claude_dir()
    project_dir = claude_dir / "projects" / decoded_encoded_path

    if not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project not found: {decoded_encoded_path}")

    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    decoded_path = path_lookup.get(decoded_encoded_path) or decode_project_path(decoded_encoded_path)
    config_projects = config.get("projects", {})
    project_config = config_projects.get(decoded_path, {})
    session_files = await get_session_files(decoded_encoded_path)

    last_activity = None
    if session_files:
        last_activity = session_files[0]["mtime"].isoformat()

    # Get recent sessions with details
    recent_sessions = []
    for file in session_files[:10]:
        session_id = file["name"].replace(".jsonl", "")
        bounds = await get_session_bounds(decoded_encoded_path, file["name"])

        recent_sessions.append({
            "id": session_id,
            "projectPath": decoded_path,
            "startTime": bounds["start_time"].isoformat() if bounds["start_time"] else None,
            "endTime": bounds["end_time"].isoformat() if bounds["end_time"] else None,
            "messageCount": bounds["message_count"],
            "model": bounds.get("model"),
            "isAgent": session_id.startswith("agent-"),
        })

    # Calculate activity summary
    total_messages = 0
    total_agent_sessions = 0
    for file in session_files:
        session_id = file["name"].replace(".jsonl", "")
        if session_id.startswith("agent-"):
            total_agent_sessions += 1
        bounds = await get_session_bounds(decoded_encoded_path, file["name"])
        total_messages += bounds["message_count"]

    first_session = session_files[-1]["mtime"].isoformat() if session_files else None

    return {
        "path": decoded_path,
        "encodedPath": decoded_encoded_path,
        "displayPath": get_display_path(decoded_path),
        "name": get_project_name(decoded_path),
        "sessionCount": len(session_files),
        "lastSessionId": project_config.get("lastSessionId"),
        "lastActivity": last_activity,
        "lastCost": project_config.get("lastCost"),
        "lastDuration": project_config.get("lastDuration"),
        "lastTotalInputTokens": project_config.get("lastTotalInputTokens"),
        "lastTotalOutputTokens": project_config.get("lastTotalOutputTokens"),
        "recentSessions": recent_sessions,
        "activitySummary": {
            "totalMessages": total_messages,
            "totalAgentSessions": total_agent_sessions,
            "dateRange": {"start": first_session, "end": last_activity},
        },
    }


@router.get("/{encoded_path}/config")
async def get_project_config(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    )
) -> dict:
    """Get raw project config.

    Returns the project-specific configuration entry including
    allowedTools, lastSessionId, costs, and MCP server settings.

    Args:
        encoded_path: URL-encoded project path

    Returns:
        Object with 'path' (decoded) and 'config' (raw config entry)

    Raises:
        404: Project not found in config (orphan project)
    """
    decoded_encoded_path = unquote(encoded_path)
    config = await get_claude_config()
    path_lookup = build_path_lookup(config)

    decoded_path = path_lookup.get(decoded_encoded_path)
    if not decoded_path:
        raise HTTPException(status_code=404, detail="Project not in config (orphan)")

    config_projects = config.get("projects", {})
    project_config = config_projects.get(decoded_path, {})

    return {"path": decoded_path, "config": project_config}


# Sessions routes are nested under projects
sessions_router = APIRouter(prefix="/projects/{encoded_path}/sessions", tags=["sessions"])


@sessions_router.get("/", response_model=PaginatedResponse[Session])
async def list_sessions(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    ),
    type: Literal["regular", "agent", "all"] = Query(
        "all",
        description="Filter by session type: 'regular' (main sessions), 'agent' (sub-agents), or 'all' (default)"
    ),
    sort_by: str = Query(
        "startTime",
        alias="sortBy",
        description="Sort field: 'startTime' (default)"
    ),
    sort_order: Literal["asc", "desc"] = Query(
        "desc",
        alias="sortOrder",
        description="Sort direction: 'asc' or 'desc' (default)"
    ),
    limit: int = Query(
        50,
        le=100,
        description="Maximum sessions per page (max 100)"
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of sessions to skip for pagination"
    ),
) -> PaginatedResponse[Session]:
    """List sessions for a project.

    Returns session transcripts for this project. Each .jsonl file
    represents one session (main or sub-agent).

    Sub-agent sessions have filenames starting with 'agent-' and are
    spawned via the Task tool during main sessions.

    Returns:
        data: List of Session objects with id, timestamps, message count
        meta: Pagination metadata
    """
    decoded_encoded_path = unquote(encoded_path)
    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    decoded_path = path_lookup.get(decoded_encoded_path) or decode_project_path(decoded_encoded_path)
    session_files = await get_session_files(decoded_encoded_path)

    sessions = []
    for file in session_files:
        session_id = file["name"].replace(".jsonl", "")
        bounds = await get_session_bounds(decoded_encoded_path, file["name"])

        sessions.append({
            "id": session_id,
            "projectPath": decoded_path,
            "startTime": bounds["start_time"].isoformat() if bounds["start_time"] else None,
            "endTime": bounds["end_time"].isoformat() if bounds["end_time"] else None,
            "messageCount": bounds["message_count"],
            "model": bounds.get("model"),
            "isAgent": session_id.startswith("agent-"),
        })

    # Filter by type
    if type == "regular":
        sessions = [s for s in sessions if not s["isAgent"]]
    elif type == "agent":
        sessions = [s for s in sessions if s["isAgent"]]

    # Paginate
    total = len(sessions)
    paginated = sessions[offset : offset + limit]

    return {
        "data": paginated,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total,
        },
    }


@sessions_router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    ),
    session_id: str = PathParam(
        description="Session UUID (e.g., '31f3f224-f440-41ac-9244-b27ff054116d') or agent ID (e.g., 'agent-a980ab1')"
    )
) -> SessionDetail:
    """Get detailed session information.

    Returns session metadata (model, tools used, duration) and all
    correlated data (todos, file history, debug logs, linked plan/skill).

    The session UUID is the universal correlation key that links
    data across directories.

    Args:
        encoded_path: URL-encoded project path
        session_id: Session UUID or agent-{shortId}

    Returns:
        SessionDetail with metadata and correlatedData

    Raises:
        404: Session not found
    """
    decoded_encoded_path = unquote(encoded_path)
    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    decoded_path = path_lookup.get(decoded_encoded_path) or decode_project_path(decoded_encoded_path)

    claude_dir = get_claude_dir()
    filename = session_id if session_id.endswith(".jsonl") else f"{session_id}.jsonl"
    file_path = claude_dir / "projects" / decoded_encoded_path / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    bounds = await get_session_bounds(decoded_encoded_path, filename)
    metadata = await get_session_metadata(decoded_encoded_path, session_id)
    correlated = await get_correlated_data(session_id)

    duration = None
    if bounds["start_time"] and bounds["end_time"]:
        # Normalize to naive datetimes to avoid mixing aware/naive
        end = bounds["end_time"].replace(tzinfo=None) if bounds["end_time"].tzinfo else bounds["end_time"]
        start = bounds["start_time"].replace(tzinfo=None) if bounds["start_time"].tzinfo else bounds["start_time"]
        duration = (end - start).total_seconds() * 1000

    return {
        "id": session_id,
        "projectPath": decoded_path,
        "startTime": bounds["start_time"].isoformat() if bounds["start_time"] else None,
        "endTime": bounds["end_time"].isoformat() if bounds["end_time"] else None,
        "messageCount": bounds["message_count"],
        "model": bounds.get("model"),
        "isAgent": session_id.startswith("agent-"),
        "duration": duration,
        "metadata": metadata,
        "correlatedData": correlated,
    }


async def get_session_metadata(
    encoded_project_path: str, session_id: str
) -> dict:
    """Get session metadata including tools used."""
    messages = await get_session_messages_raw(encoded_project_path, session_id)
    tools_used = set()
    model = None

    for msg in messages:
        if msg.get("model"):
            model = msg["model"]

        if msg.get("type") == "assistant":
            content = msg.get("content", {})
            if isinstance(content, dict):
                blocks = content.get("content", [])
                if isinstance(blocks, list):
                    for block in blocks:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            if block.get("name"):
                                tools_used.add(block["name"])

    return {
        "totalTokens": 0,
        "model": model,
        "toolsUsed": list(tools_used),
    }


async def get_correlated_data(session_id: str) -> dict:
    """Get correlated data for a session."""
    from .correlated import (
        find_linked_plan,
        find_linked_skill,
        find_session_debug_logs,
        find_session_file_history,
        find_session_todos,
    )

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


# Messages routes
messages_router = APIRouter(
    prefix="/projects/{encoded_path}/sessions/{session_id}/messages",
    tags=["messages"],
)


@messages_router.get("/", response_model=PaginatedResponse[Message])
async def list_messages(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    ),
    session_id: str = PathParam(
        description="Session UUID or agent ID"
    ),
    type: Literal["user", "assistant", "all"] = Query(
        "all",
        description="Filter by message type: 'user', 'assistant', or 'all' (default)"
    ),
    limit: int = Query(
        50,
        le=100,
        description="Maximum messages per page (max 100)"
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of messages to skip for pagination"
    ),
) -> PaginatedResponse[Message]:
    """List messages in a session.

    Returns messages from the session transcript JSONL file.
    Messages are returned in chronological order.

    Message types:
    - user: User prompts with content as string
    - assistant: Claude responses with content as array of ContentBlocks

    Note: file-history-snapshot entries are excluded from this endpoint.

    Returns:
        data: List of Message objects
        meta: Pagination metadata
    """
    decoded_encoded_path = unquote(encoded_path)
    messages = await get_session_messages_raw(decoded_encoded_path, session_id)

    # Filter by type
    if type == "user":
        messages = [m for m in messages if m["type"] == "user"]
    elif type == "assistant":
        messages = [m for m in messages if m["type"] == "assistant"]

    # Paginate
    total = len(messages)
    paginated = messages[offset : offset + limit]

    return {
        "data": paginated,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total,
        },
    }


@messages_router.get("/{message_id}")
async def get_message(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    ),
    session_id: str = PathParam(
        description="Session UUID or agent ID"
    ),
    message_id: str = PathParam(
        description="Message UUID to retrieve"
    )
) -> Message:
    """Get a specific message by UUID.

    Args:
        encoded_path: URL-encoded project path
        session_id: Session UUID or agent ID
        message_id: Unique message identifier (uuid field)

    Returns:
        Message object with uuid, type, timestamp, content, model, cwd, gitBranch

    Raises:
        404: Message not found
    """
    decoded_encoded_path = unquote(encoded_path)
    messages = await get_session_messages_raw(decoded_encoded_path, session_id)

    for msg in messages:
        if msg["uuid"] == message_id:
            return msg

    raise HTTPException(status_code=404, detail=f"Message not found: {message_id}")


# Activity routes
activity_router = APIRouter(prefix="/projects/{encoded_path}/activity", tags=["activity"])


@activity_router.get("/", response_model=ActivityResponse)
async def get_activity(
    encoded_path: str = PathParam(
        description="URL-encoded project path"
    ),
    days: int = Query(
        14,
        le=90,
        description="Number of days to look back (max 90, default 14)"
    ),
    type: Literal["regular", "agent", "all"] = Query(
        "regular",
        description="Filter by session type: 'regular' (default), 'agent', or 'all'"
    ),
) -> ActivityResponse:
    """Get activity timeline for a project.

    Aggregates sessions by date for the specified time period.
    Useful for building activity charts and calendars.

    Returns daily activity including session count, total messages,
    and session details for each day.

    Returns:
        data: List of DailyProjectActivity sorted by date descending
        summary: ActivitySummaryStats with totals and maxDailyMessages
    """
    decoded_encoded_path = unquote(encoded_path)
    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    decoded_path = path_lookup.get(decoded_encoded_path) or decode_project_path(decoded_encoded_path)
    session_files = await get_session_files(decoded_encoded_path)

    # Get all sessions with their start times
    sessions = []
    for file in session_files:
        session_id = file["name"].replace(".jsonl", "")
        bounds = await get_session_bounds(decoded_encoded_path, file["name"])

        sessions.append({
            "id": session_id,
            "projectPath": decoded_path,
            "startTime": bounds["start_time"],
            "endTime": bounds["end_time"],
            "messageCount": bounds["message_count"],
            "model": bounds.get("model"),
            "isAgent": session_id.startswith("agent-"),
        })

    # Filter by type
    if type == "regular":
        sessions = [s for s in sessions if not s["isAgent"]]
    elif type == "agent":
        sessions = [s for s in sessions if s["isAgent"]]

    # Group by day
    from datetime import timedelta
    now = datetime.now()
    cutoff = now - timedelta(days=days)

    daily_map: dict[str, dict] = {}

    for session in sessions:
        if session["startTime"] < cutoff:
            continue

        date_str = session["startTime"].strftime("%Y-%m-%d")
        if date_str not in daily_map:
            daily_map[date_str] = {"sessions": [], "total_messages": 0}

        daily_map[date_str]["sessions"].append(session)
        daily_map[date_str]["total_messages"] += session["messageCount"]

    # Convert to response format
    daily_activity = []
    for date, data in sorted(daily_map.items(), reverse=True):
        daily_activity.append({
            "date": date,
            "sessions": [
                {
                    **s,
                    "startTime": s["startTime"].isoformat(),
                    "endTime": s["endTime"].isoformat() if s["endTime"] else None,
                }
                for s in data["sessions"]
            ],
            "totalMessages": data["total_messages"],
            "sessionCount": len(data["sessions"]),
        })

    # Calculate summary
    total_sessions = sum(d["sessionCount"] for d in daily_activity)
    total_messages = sum(d["totalMessages"] for d in daily_activity)
    max_daily_messages = max((d["totalMessages"] for d in daily_activity), default=0)

    return {
        "data": daily_activity,
        "summary": {
            "totalSessions": total_sessions,
            "totalMessages": total_messages,
            "maxDailyMessages": max_daily_messages,
        },
    }
