"""Stats routes for Claude Explorer API.

Provides aggregated usage statistics from cached stats
and computed metrics from session files.
"""

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query

from ..models import DailyActivity, DailyActivityResponse, ModelUsage, ModelUsageResponse, Stats
from ..utils import get_claude_config_path, get_claude_dir, parse_jsonl_file

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/", response_model=Stats)
async def get_stats() -> Stats:
    """Get aggregated usage statistics.

    Returns cached stats if available. If no cache exists, computes
    basic stats by scanning session files.

    Stats include:
    - totalSessions: Count of all session files
    - totalMessages: Count of all user/assistant messages
    - firstSessionDate: Timestamp of oldest session
    - longestSession: Session with most messages
    - hourCounts: Message distribution by hour (0-23)

    Returns:
        Stats object with usage metrics
    """
    claude_dir = get_claude_dir()
    stats_path = claude_dir / "stats-cache.json"

    # Try to read cached stats
    if stats_path.exists():
        try:
            content = stats_path.read_text()
            return json.loads(content)
        except Exception:
            pass

    # Compute basic stats
    projects_dir = claude_dir / "projects"
    if not projects_dir.exists():
        return {
            "version": 1,
            "lastComputedDate": datetime.now().strftime("%Y-%m-%d"),
            "totalSessions": 0,
            "totalMessages": 0,
        }

    total_sessions = 0
    total_messages = 0

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        for file in project_dir.iterdir():
            if file.suffix != ".jsonl":
                continue
            total_sessions += 1

            try:
                content = file.read_text()
                lines = parse_jsonl_file(content)
                for parsed in lines:
                    if parsed.get("type") != "file-history-snapshot":
                        total_messages += 1
            except Exception:
                continue

    return {
        "version": 1,
        "lastComputedDate": datetime.now().strftime("%Y-%m-%d"),
        "totalSessions": total_sessions,
        "totalMessages": total_messages,
    }


@router.get("/daily", response_model=DailyActivityResponse)
async def get_daily_stats(
    start_date: str | None = Query(
        None,
        alias="startDate",
        description="Start of date range (YYYY-MM-DD format)"
    ),
    end_date: str | None = Query(
        None,
        alias="endDate",
        description="End of date range (YYYY-MM-DD format)"
    ),
    limit: int = Query(
        30,
        le=100,
        description="Maximum number of days to return (max 100)"
    ),
) -> DailyActivityResponse:
    """Get daily activity breakdown.

    Aggregates activity by date from session file modification times.
    Counts messages, sessions, and tool calls per day.

    Results are sorted by date descending (most recent first).

    Returns:
        data: List of DailyActivity objects with date, messageCount,
              sessionCount, and toolCallCount
    """
    claude_dir = get_claude_dir()
    projects_dir = claude_dir / "projects"

    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None

    daily_stats: dict[str, dict] = {}

    if not projects_dir.exists():
        return {"data": []}

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        for file in project_dir.iterdir():
            if file.suffix != ".jsonl":
                continue

            try:
                stat = file.stat()
                date = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")

                if start_dt and datetime.fromisoformat(date) < start_dt:
                    continue
                if end_dt and datetime.fromisoformat(date) > end_dt:
                    continue

                if date not in daily_stats:
                    daily_stats[date] = {
                        "messageCount": 0,
                        "sessionCount": 0,
                        "toolCallCount": 0,
                    }

                daily_stats[date]["sessionCount"] += 1

                content = file.read_text()
                lines = parse_jsonl_file(content)

                for parsed in lines:
                    if parsed.get("type") == "file-history-snapshot":
                        continue
                    daily_stats[date]["messageCount"] += 1

                    # Count tool calls
                    if parsed.get("type") == "assistant":
                        msg_content = parsed.get("message", {}).get("content", [])
                        if isinstance(msg_content, list):
                            for block in msg_content:
                                if isinstance(block, dict) and block.get("type") == "tool_use":
                                    daily_stats[date]["toolCallCount"] += 1
            except Exception:
                continue

    # Convert to sorted array
    data = [
        {"date": date, **stats}
        for date, stats in sorted(daily_stats.items(), reverse=True)
    ][:limit]

    return {"data": data}


@router.get("/models", response_model=ModelUsageResponse)
async def get_model_stats() -> ModelUsageResponse:
    """Get token usage aggregated by Claude model.

    Sums lastModelUsage from all projects in config to show
    total token consumption per model.

    Token types:
    - inputTokens: Tokens sent to the model
    - outputTokens: Tokens received from the model
    - cacheReadInputTokens: Tokens read from prompt cache (cost reduction)
    - cacheCreationInputTokens: Tokens used to populate cache

    Returns:
        data: Dictionary mapping model ID (e.g., 'claude-opus-4-5-20251101')
              to ModelUsage with token counts
    """
    try:
        config_path = get_claude_config_path()
        content = config_path.read_text()
        config = json.loads(content)

        model_usage: dict[str, dict] = {}
        projects = config.get("projects", {})

        for project_config in projects.values():
            usage = project_config.get("lastModelUsage", {})
            for model, stats in usage.items():
                if model not in model_usage:
                    model_usage[model] = {
                        "inputTokens": 0,
                        "outputTokens": 0,
                        "cacheReadInputTokens": 0,
                        "cacheCreationInputTokens": 0,
                    }
                model_usage[model]["inputTokens"] += stats.get("inputTokens", 0)
                model_usage[model]["outputTokens"] += stats.get("outputTokens", 0)
                model_usage[model]["cacheReadInputTokens"] += stats.get("cacheReadInputTokens", 0)
                model_usage[model]["cacheCreationInputTokens"] += stats.get("cacheCreationInputTokens", 0)

        return {"data": model_usage}
    except Exception:
        return {"data": {}}
