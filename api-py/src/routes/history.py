"""History routes for Claude Explorer API."""

from fastapi import APIRouter, Query

from ..models import HistoryResponse
from ..utils import get_claude_dir, parse_jsonl_file

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/", response_model=HistoryResponse)
async def get_history(
    project: str | None = Query(None),
    start_date: str | None = Query(None, alias="startDate"),
    end_date: str | None = Query(None, alias="endDate"),
    search: str | None = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """Get prompt history."""
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

        return {
            "data": paginated,
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
