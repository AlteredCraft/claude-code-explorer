"""Global activity routes for cross-project queries.

These endpoints aggregate session activity across all projects,
supporting date range filtering and summary statistics.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Query

from ..models import (
    ActivitySummaryStats,
    DailyBreakdown,
    DateRange,
    GlobalActivityResponse,
    GlobalActivitySummary,
    GlobalDailyActivity,
    ProjectBreakdown,
)
from ..utils import (
    build_path_lookup,
    encode_project_path,
    get_claude_config,
    get_claude_dir,
    get_project_name,
    parse_timestamp,
)
from .projects import get_session_bounds, get_session_files

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get(
    "/",
    response_model=GlobalActivityResponse,
    summary="Get cross-project activity timeline",
    description="""
Retrieve activity across ALL projects for a given date range in a single API call.

**Why use this endpoint?**
- Avoid making separate requests to each project's activity endpoint
- Build cross-project dashboards and timelines
- Track overall Claude Code usage patterns across your entire workspace

Returns sessions grouped by day with project information attached to each session.
    """,
)
async def get_global_activity(
    start_date: str = Query(
        ...,
        alias="startDate",
        description="Start of date range (inclusive). Format: YYYY-MM-DD",
        pattern=r"^\d{4}-\d{2}-\d{2}$"
    ),
    end_date: str = Query(
        ...,
        alias="endDate",
        description="End of date range (inclusive). Format: YYYY-MM-DD",
        pattern=r"^\d{4}-\d{2}-\d{2}$"
    ),
    type: Literal["regular", "agent", "all"] = Query(
        "all",
        description="Filter by session type: 'regular' (main sessions only), 'agent' (sub-agents only), or 'all' (both)"
    ),
) -> GlobalActivityResponse:
    """Get activity across all projects for a date range."""
    # Parse date bounds
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
        hour=23, minute=59, second=59, tzinfo=timezone.utc
    )

    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    projects_dir = get_claude_dir() / "projects"

    if not projects_dir.exists():
        return {
            "data": [],
            "summary": {
                "totalSessions": 0,
                "totalMessages": 0,
                "maxDailyMessages": 0,
            },
        }

    # Collect sessions from all projects
    all_sessions = []

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        project_id = project_dir.name
        real_path = path_lookup.get(project_id)
        project_name = get_project_name(real_path) if real_path else project_id

        session_files = await get_session_files(project_id)

        for file in session_files:
            session_id = file["name"].replace(".jsonl", "")
            bounds = await get_session_bounds(project_id, file["name"])

            if not bounds["start_time"]:
                continue

            # Filter by date range
            if bounds["start_time"] < start_dt or bounds["start_time"] > end_dt:
                continue

            is_agent = session_id.startswith("agent-")

            # Filter by type
            if type == "regular" and is_agent:
                continue
            if type == "agent" and not is_agent:
                continue

            all_sessions.append({
                "id": session_id,
                "projectPath": real_path or project_id,
                "projectId": project_id,
                "projectName": project_name,
                "startTime": bounds["start_time"],
                "endTime": bounds["end_time"],
                "messageCount": bounds["message_count"],
                "model": bounds.get("model"),
                "isAgent": is_agent,
            })

    # Group by day
    daily_map: dict[str, dict] = {}

    for session in all_sessions:
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


@router.get(
    "/summary",
    response_model=GlobalActivitySummary,
    summary="Get aggregated activity summary",
    description="""
Get aggregate statistics across all projects without individual session details.

**Why use this endpoint?**
- Lighter payload than the full activity endpoint - just counts, no session data
- Get per-project and per-day breakdowns in a single call
- Perfect for dashboards showing: "You had 12 sessions across 3 projects this week"

Returns totals plus breakdowns by project (ranked by message count) and by day.
    """,
)
async def get_activity_summary(
    start_date: str = Query(
        ...,
        alias="startDate",
        description="Start of date range (inclusive). Format: YYYY-MM-DD",
        pattern=r"^\d{4}-\d{2}-\d{2}$"
    ),
    end_date: str = Query(
        ...,
        alias="endDate",
        description="End of date range (inclusive). Format: YYYY-MM-DD",
        pattern=r"^\d{4}-\d{2}-\d{2}$"
    ),
    type: Literal["regular", "agent", "all"] = Query(
        "all",
        description="Filter by session type: 'regular' (main sessions only), 'agent' (sub-agents only), or 'all' (both)"
    ),
) -> GlobalActivitySummary:
    """Get aggregated activity summary across all projects."""
    # Parse date bounds
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
        hour=23, minute=59, second=59, tzinfo=timezone.utc
    )

    config = await get_claude_config()
    path_lookup = build_path_lookup(config)
    projects_dir = get_claude_dir() / "projects"

    if not projects_dir.exists():
        return {
            "dateRange": {"start": start_date, "end": end_date},
            "totalSessions": 0,
            "totalMessages": 0,
            "projectBreakdown": [],
            "dailyBreakdown": [],
        }

    # Aggregators
    project_stats: dict[str, dict] = {}  # project_id -> {sessions, messages, name}
    daily_stats: dict[str, dict] = {}  # date -> {sessions, messages}
    total_sessions = 0
    total_messages = 0

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        project_id = project_dir.name
        real_path = path_lookup.get(project_id)
        project_name = get_project_name(real_path) if real_path else project_id

        session_files = await get_session_files(project_id)

        for file in session_files:
            session_id = file["name"].replace(".jsonl", "")
            bounds = await get_session_bounds(project_id, file["name"])

            if not bounds["start_time"]:
                continue

            # Filter by date range
            if bounds["start_time"] < start_dt or bounds["start_time"] > end_dt:
                continue

            is_agent = session_id.startswith("agent-")

            # Filter by type
            if type == "regular" and is_agent:
                continue
            if type == "agent" and not is_agent:
                continue

            msg_count = bounds["message_count"]

            # Update project stats
            if project_id not in project_stats:
                project_stats[project_id] = {
                    "name": project_name,
                    "sessions": 0,
                    "messages": 0,
                }
            project_stats[project_id]["sessions"] += 1
            project_stats[project_id]["messages"] += msg_count

            # Update daily stats
            date_str = bounds["start_time"].strftime("%Y-%m-%d")
            if date_str not in daily_stats:
                daily_stats[date_str] = {"sessions": 0, "messages": 0}
            daily_stats[date_str]["sessions"] += 1
            daily_stats[date_str]["messages"] += msg_count

            total_sessions += 1
            total_messages += msg_count

    # Build breakdowns
    project_breakdown = [
        {
            "project": stats["name"],
            "projectId": pid,
            "sessions": stats["sessions"],
            "messages": stats["messages"],
        }
        for pid, stats in sorted(
            project_stats.items(),
            key=lambda x: x[1]["messages"],
            reverse=True
        )
    ]

    daily_breakdown = [
        {
            "date": date,
            "sessions": stats["sessions"],
            "messages": stats["messages"],
        }
        for date, stats in sorted(daily_stats.items(), reverse=True)
    ]

    return {
        "dateRange": {"start": start_date, "end": end_date},
        "totalSessions": total_sessions,
        "totalMessages": total_messages,
        "projectBreakdown": project_breakdown,
        "dailyBreakdown": daily_breakdown,
    }
