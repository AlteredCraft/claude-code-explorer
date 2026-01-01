"""History routes for Claude Explorer API.

Provides access to prompt history - a chronological log of all user
prompts across projects without full conversation context.
"""

from fastapi import APIRouter, Query

from ..models import HistoryResponse
from ..utils import encode_project_path, get_claude_dir, parse_jsonl_file

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/", response_model=HistoryResponse)
async def get_history(
    project: str | None = Query(
        None,
        description="Filter to prompts from projects containing this path substring"
    ),
    start_date: str | None = Query(
        None,
        alias="startDate",
        description="Filter prompts on or after this date (ISO 8601 format, e.g., '2024-01-15')"
    ),
    end_date: str | None = Query(
        None,
        alias="endDate",
        description="Filter prompts on or before this date (ISO 8601 format)"
    ),
    search: str | None = Query(
        None,
        description="Filter prompts containing this text (case-insensitive)"
    ),
    limit: int = Query(
        50,
        le=100,
        description="Maximum number of prompts to return (max 100)"
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of prompts to skip for pagination"
    ),
) -> HistoryResponse:
    """Get prompt history across all sessions.

    Returns history entries sorted by timestamp descending (most recent
    first). Each entry contains the prompt text, timestamp, project path,
    and any pasted content.

    This provides a quick activity timeline without loading full
    session transcripts.

    Returns:
        data: List of HistoryEntry objects
        meta: Pagination metadata with total, limit, offset, hasMore
    """
    claude_dir = get_claude_dir()
    history_path = claude_dir / "history.jsonl"

    if not history_path.exists():
        return {
            "data": [],
            "meta": {"total": 0, "limit": limit, "offset": offset, "hasMore": False},
        }

    try:
        content = history_path.read_text()
        entries = parse_jsonl_file(content)

        # Apply filters
        if project:
            entries = [e for e in entries if project in e.get("project", "")]

        if search:
            query = search.lower()
            entries = [e for e in entries if query in e.get("display", "").lower()]

        if start_date:
            from datetime import datetime
            start_ts = datetime.fromisoformat(start_date).timestamp() * 1000
            entries = [e for e in entries if e.get("timestamp", 0) >= start_ts]

        if end_date:
            from datetime import datetime
            end_ts = datetime.fromisoformat(end_date).timestamp() * 1000
            entries = [e for e in entries if e.get("timestamp", 0) <= end_ts]

        # Sort by timestamp descending
        entries.sort(key=lambda e: e.get("timestamp", 0), reverse=True)

        # Paginate
        total = len(entries)
        paginated = entries[offset : offset + limit]

        # Transform entries to use projectPath and projectId
        transformed = []
        for entry in paginated:
            project = entry.get("project")
            transformed.append({
                "display": entry.get("display", ""),
                "timestamp": entry.get("timestamp", 0),
                "projectPath": project,
                "projectId": encode_project_path(project) if project else None,
                "pastedContents": entry.get("pastedContents"),
            })

        return {
            "data": transformed,
            "meta": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "hasMore": offset + limit < total,
            },
        }
    except Exception:
        return {
            "data": [],
            "meta": {"total": 0, "limit": limit, "offset": offset, "hasMore": False},
        }
