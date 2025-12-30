"""Pydantic models for the Claude Explorer API."""

from datetime import datetime
from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


# Pagination
class PaginationMeta(BaseModel):
    total: int
    limit: int
    offset: int
    has_more: bool = Field(alias="hasMore")

    class Config:
        populate_by_name = True


class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    meta: PaginationMeta


# Projects
class Project(BaseModel):
    path: str
    encoded_path: str = Field(alias="encodedPath")
    display_path: str = Field(alias="displayPath")
    name: str
    session_count: int = Field(alias="sessionCount")
    last_session_id: str | None = Field(None, alias="lastSessionId")
    last_activity: str | None = Field(None, alias="lastActivity")
    last_cost: float | None = Field(None, alias="lastCost")
    last_duration: float | None = Field(None, alias="lastDuration")
    last_total_input_tokens: int | None = Field(None, alias="lastTotalInputTokens")
    last_total_output_tokens: int | None = Field(None, alias="lastTotalOutputTokens")
    has_session_data: bool = Field(True, alias="hasSessionData")

    class Config:
        populate_by_name = True


class Session(BaseModel):
    id: str
    project_path: str = Field(alias="projectPath")
    start_time: str = Field(alias="startTime")
    end_time: str | None = Field(None, alias="endTime")
    message_count: int = Field(alias="messageCount")
    model: str | None = None
    is_agent: bool = Field(alias="isAgent")
    parent_session_id: str | None = Field(None, alias="parentSessionId")
    sub_agent_ids: list[str] | None = Field(None, alias="subAgentIds")

    class Config:
        populate_by_name = True


class ActivitySummary(BaseModel):
    total_messages: int = Field(alias="totalMessages")
    total_agent_sessions: int = Field(alias="totalAgentSessions")
    date_range: dict[str, str | None] = Field(alias="dateRange")

    class Config:
        populate_by_name = True


class ProjectDetail(Project):
    recent_sessions: list[Session] = Field(alias="recentSessions")
    activity_summary: ActivitySummary = Field(alias="activitySummary")


# Session Detail
class SessionMetadata(BaseModel):
    total_tokens: int = Field(alias="totalTokens")
    cost: float | None = None
    duration: int | None = None
    model: str | None = None
    tools_used: list[str] = Field(alias="toolsUsed")

    class Config:
        populate_by_name = True


class TodoItem(BaseModel):
    content: str
    status: str  # 'pending' | 'in_progress' | 'completed'


class FileHistoryEntry(BaseModel):
    file_path: str = Field(alias="filePath")
    backup_file_name: str = Field(alias="backupFileName")
    version: int
    backup_time: str | None = Field(None, alias="backupTime")
    message_id: str | None = Field(None, alias="messageId")

    class Config:
        populate_by_name = True


class CorrelatedData(BaseModel):
    todos: list[TodoItem]
    file_history: list[FileHistoryEntry] = Field(alias="fileHistory")
    debug_logs: list[str] = Field(alias="debugLogs")
    linked_plan: str | None = Field(None, alias="linkedPlan")
    linked_skill: str | None = Field(None, alias="linkedSkill")

    class Config:
        populate_by_name = True


class SessionDetail(Session):
    duration: float | None = None
    metadata: SessionMetadata
    correlated_data: CorrelatedData = Field(alias="correlatedData")


# Messages
class ContentBlock(BaseModel):
    type: str  # 'text' | 'thinking' | 'tool_use' | 'tool_result'
    text: str | None = None
    thinking: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None
    tool_use_id: str | None = Field(None, alias="tool_use_id")
    content: str | list[Any] | None = None


class MessageContent(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str | list[ContentBlock]


class Message(BaseModel):
    uuid: str
    parent_uuid: str | None = Field(None, alias="parentUuid")
    type: str  # 'user' | 'assistant' | 'file-history-snapshot' | 'progress' | 'result'
    timestamp: str
    session_id: str = Field(alias="sessionId")
    content: MessageContent
    model: str | None = None
    cwd: str | None = None
    git_branch: str | None = Field(None, alias="gitBranch")

    class Config:
        populate_by_name = True


# Activity (for /projects/{path}/activity)
class DailyProjectActivity(BaseModel):
    date: str
    sessions: list[Session]
    total_messages: int = Field(alias="totalMessages")
    session_count: int = Field(alias="sessionCount")

    class Config:
        populate_by_name = True


class ActivitySummaryStats(BaseModel):
    total_sessions: int = Field(alias="totalSessions")
    total_messages: int = Field(alias="totalMessages")
    max_daily_messages: int = Field(alias="maxDailyMessages")

    class Config:
        populate_by_name = True


class ActivityResponse(BaseModel):
    data: list[DailyProjectActivity]
    summary: ActivitySummaryStats


# Sub-agents
class SubAgentResponse(BaseModel):
    parent_session_id: str | None = Field(None, alias="parentSessionId")
    sub_agents: list[Session] = Field(alias="subAgents")

    class Config:
        populate_by_name = True


# File backup content
class FileBackupContent(BaseModel):
    backup_file_name: str = Field(alias="backupFileName")
    content: str
    size: int


# Shell snapshots
class ShellSnapshot(BaseModel):
    filename: str
    shell: str | None = None
    timestamp: int | None = None


# Plans
class Plan(BaseModel):
    name: str
    content: str | None = None


# Skills
class Skill(BaseModel):
    name: str
    description: str | None = None
    allowed_tools: list[str] | None = Field(None, alias="allowedTools")
    content: str | None = None
    is_symlink: bool | None = Field(None, alias="isSymlink")
    real_path: str | None = Field(None, alias="realPath")

    class Config:
        populate_by_name = True


# Commands
class Command(BaseModel):
    name: str
    description: str | None = None
    content: str | None = None


# Plugins
class Plugin(BaseModel):
    name: str
    version: str
    scope: str | None = None
    install_path: str | None = Field(None, alias="installPath")
    installed_at: str | None = Field(None, alias="installedAt")
    git_commit_sha: str | None = Field(None, alias="gitCommitSha")
    skills: list[str] | None = None

    class Config:
        populate_by_name = True


# Stats
class LongestSession(BaseModel):
    session_id: str | None = Field(None, alias="sessionId")
    duration: int | None = None
    message_count: int | None = Field(None, alias="messageCount")

    class Config:
        populate_by_name = True


class Stats(BaseModel):
    version: int | None = None
    last_computed_date: str | None = Field(None, alias="lastComputedDate")
    total_sessions: int | None = Field(None, alias="totalSessions")
    total_messages: int | None = Field(None, alias="totalMessages")
    first_session_date: str | None = Field(None, alias="firstSessionDate")
    longest_session: LongestSession | None = Field(None, alias="longestSession")
    hour_counts: dict[str, int] | None = Field(None, alias="hourCounts")

    class Config:
        populate_by_name = True


# DailyActivity (for /stats/daily) - NOT the same as DailyProjectActivity
class DailyActivity(BaseModel):
    date: str
    message_count: int = Field(alias="messageCount")
    session_count: int = Field(alias="sessionCount")
    tool_call_count: int = Field(alias="toolCallCount")

    class Config:
        populate_by_name = True


class ModelUsage(BaseModel):
    input_tokens: int = Field(alias="inputTokens")
    output_tokens: int = Field(alias="outputTokens")
    cache_read_input_tokens: int = Field(alias="cacheReadInputTokens")
    cache_creation_input_tokens: int = Field(alias="cacheCreationInputTokens")

    class Config:
        populate_by_name = True


# Response wrappers for OpenAPI schema generation
class DailyActivityResponse(BaseModel):
    data: list[DailyActivity]


class ModelUsageResponse(BaseModel):
    data: dict[str, ModelUsage]


# History
class HistoryEntry(BaseModel):
    display: str
    timestamp: int
    project: str | None = None
    pasted_contents: dict[str, Any] | None = Field(None, alias="pastedContents")

    class Config:
        populate_by_name = True


class HistoryResponse(BaseModel):
    data: list[HistoryEntry]
    meta: PaginationMeta


# Files
class FileEntry(BaseModel):
    name: str
    is_directory: bool = Field(alias="isDirectory")

    class Config:
        populate_by_name = True


class FileContent(BaseModel):
    type: str  # 'file' | 'directory'
    path: str
    content: str | None = None
    entries: list[FileEntry] | None = None
    error: str | None = None


# Error response
class Error(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


# Config (read-only, redacted)
class ClaudeConfig(BaseModel):
    """Claude configuration from ~/.claude.json (sensitive data redacted)."""
    model_config = {"extra": "allow"}  # Allow any fields since config is dynamic


# Settings
class ClaudeSettings(BaseModel):
    """User settings from ~/.claude/settings.json."""
    model_config = {"extra": "allow"}  # Allow any fields since settings are dynamic
