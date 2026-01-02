"""Pydantic models for the Claude Explorer API."""

from datetime import datetime
from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


# Pagination
class PaginationMeta(BaseModel):
    """Metadata for paginated responses."""
    total: int = Field(description="Total number of items matching the query")
    limit: int = Field(description="Maximum items per page")
    offset: int = Field(description="Number of items skipped from the start")
    has_more: bool = Field(
        alias="hasMore",
        description="True if more items exist beyond current offset + limit"
    )

    class Config:
        populate_by_name = True


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic wrapper for paginated list responses."""
    data: list[T] = Field(description="List of items for the current page")
    meta: PaginationMeta = Field(description="Pagination metadata")


# Projects
class Project(BaseModel):
    """A project with Claude Code session data.

    Projects are identified by their filesystem path and contain
    session transcripts.
    """
    path: str = Field(description="Absolute filesystem path to the project directory")
    id: str = Field(
        alias="projectId",
        description="Project identifier for API routing (e.g., '-Users-sam-Projects-foo')"
    )
    display_path: str = Field(
        alias="displayPath",
        description="Human-readable path with ~ substituted for home directory"
    )
    name: str = Field(description="Project directory name (last path component)")
    session_count: int = Field(
        alias="sessionCount",
        description="Number of session transcripts in this project"
    )
    last_session_id: str | None = Field(
        None,
        alias="lastSessionId",
        description="UUID of the most recent session"
    )
    last_activity: str | None = Field(
        None,
        alias="lastActivity",
        description="ISO 8601 timestamp of most recently modified session"
    )
    last_cost: float | None = Field(
        None,
        alias="lastCost",
        description="API cost in USD of the last session"
    )
    last_duration: float | None = Field(
        None,
        alias="lastDuration",
        description="Duration of last API request in milliseconds"
    )
    last_total_input_tokens: int | None = Field(
        None,
        alias="lastTotalInputTokens",
        description="Total input tokens used in last session"
    )
    last_total_output_tokens: int | None = Field(
        None,
        alias="lastTotalOutputTokens",
        description="Total output tokens generated in last session"
    )
    has_session_data: bool = Field(
        True,
        alias="hasSessionData",
        description="True if project has session transcripts. False for config-only projects"
    )
    is_orphan: bool = Field(
        False,
        alias="isOrphan",
        description="True if session data exists but project has no config entry"
    )

    class Config:
        populate_by_name = True


class Session(BaseModel):
    """A Claude Code conversation session.

    Session UUID is the universal key that links related data:
    transcripts, file backups, todos, environment, and debug logs.
    """
    id: str = Field(
        description="Session UUID (e.g., 31f3f224-f440-41ac-9244-b27ff054116d) or agent ID (e.g., agent-a980ab1)"
    )
    project_path: str = Field(
        alias="projectPath",
        description="Absolute filesystem path to the project this session belongs to"
    )
    start_time: str | None = Field(
        None,
        alias="startTime",
        description="ISO 8601 timestamp of first message in the session"
    )
    end_time: str | None = Field(
        None,
        alias="endTime",
        description="ISO 8601 timestamp of last message in the session"
    )
    message_count: int = Field(
        alias="messageCount",
        description="Total user and assistant messages (excludes file-history-snapshot entries)"
    )
    model: str | None = Field(
        None,
        description="Claude model used (e.g., claude-opus-4-5-20251101)"
    )
    is_agent: bool = Field(
        alias="isAgent",
        description="True if sub-agent session spawned by Task tool"
    )
    parent_session_id: str | None = Field(
        None,
        alias="parentSessionId",
        description="For sub-agent sessions, the UUID of the main session that spawned this agent"
    )
    sub_agent_ids: list[str] | None = Field(
        None,
        alias="subAgentIds",
        description="For main sessions, list of sub-agent session IDs spawned during this session"
    )

    class Config:
        populate_by_name = True


class ActivitySummary(BaseModel):
    """Summary statistics for project activity."""
    total_messages: int = Field(
        alias="totalMessages",
        description="Total messages across all sessions in the project"
    )
    total_agent_sessions: int = Field(
        alias="totalAgentSessions",
        description="Number of sub-agent sessions"
    )
    date_range: dict[str, str | None] = Field(
        alias="dateRange",
        description="Object with 'start' and 'end' ISO 8601 timestamps spanning all sessions"
    )

    class Config:
        populate_by_name = True


class ProjectDetail(Project):
    """Extended project information including recent sessions and activity summary."""
    recent_sessions: list[Session] = Field(
        alias="recentSessions",
        description="Up to 10 most recent sessions sorted by modification time"
    )
    activity_summary: ActivitySummary = Field(
        alias="activitySummary",
        description="Aggregate statistics for this project"
    )


# Session Detail
class SessionMetadata(BaseModel):
    """Metadata extracted from session transcript."""
    total_tokens: int = Field(
        alias="totalTokens",
        description="Combined input and output tokens (if available from stats)"
    )
    cost: float | None = Field(
        None,
        description="API cost in USD for this session"
    )
    duration: int | None = Field(
        None,
        description="Session duration in milliseconds (end_time - start_time)"
    )
    model: str | None = Field(
        None,
        description="Claude model used (e.g., claude-opus-4-5-20251101)"
    )
    tools_used: list[str] = Field(
        alias="toolsUsed",
        description="Unique tool names invoked during the session (e.g., Read, Edit, Bash)"
    )

    class Config:
        populate_by_name = True


class TodoItem(BaseModel):
    """A task item from the session's todo list."""
    content: str = Field(description="Task description text")
    status: str = Field(description="Task status: 'pending', 'in_progress', or 'completed'")


class FileHistoryEntry(BaseModel):
    """A versioned file backup from the session."""
    file_path: str = Field(
        alias="filePath",
        description="Original file path that was backed up"
    )
    backup_file_name: str = Field(
        alias="backupFileName",
        description="Backup filename in format {contentHash}@v{version} (e.g., 59e0b9c43163e850@v1)"
    )
    version: int = Field(description="Sequential version number for this file within the session")
    backup_time: str | None = Field(
        None,
        alias="backupTime",
        description="ISO 8601 timestamp when the backup was created"
    )
    message_id: str | None = Field(
        None,
        alias="messageId",
        description="UUID of the assistant message that triggered this backup"
    )

    class Config:
        populate_by_name = True


class CorrelatedData(BaseModel):
    """Data correlated by session UUID.

    Session UUID links: todos, file history, debug logs, and references
    to plans and skills.
    """
    todos: list[TodoItem] = Field(
        description="Task items for this session"
    )
    file_history: list[FileHistoryEntry] = Field(
        alias="fileHistory",
        description="File backups created during this session"
    )
    debug_logs: list[str] = Field(
        alias="debugLogs",
        description="Debug log content (truncated to 5KB each)"
    )
    linked_plan: str | None = Field(
        None,
        alias="linkedPlan",
        description="Plan filename if session ID is mentioned in a plan document"
    )
    linked_skill: str | None = Field(
        None,
        alias="linkedSkill",
        description="Skill name if detected in session (reserved for future use)"
    )

    class Config:
        populate_by_name = True


class SessionDetail(Session):
    """Complete session information including metadata and correlated data."""
    duration: float | None = Field(
        None,
        description="Session duration in milliseconds (end_time - start_time)"
    )
    metadata: SessionMetadata = Field(description="Session statistics and tool usage")
    correlated_data: CorrelatedData = Field(
        alias="correlatedData",
        description="Data linked by session UUID: todos, file history, debug logs, plans"
    )


# Messages
class ContentBlock(BaseModel):
    """A content block within a message.

    Messages can contain multiple blocks of different types:
    text, thinking (extended thinking), tool_use, tool_result.
    """
    type: str = Field(description="Block type: 'text', 'thinking', 'tool_use', or 'tool_result'")
    text: str | None = Field(None, description="Text content (for 'text' type)")
    thinking: str | None = Field(None, description="Extended thinking content (for 'thinking' type)")
    name: str | None = Field(None, description="Tool name (for 'tool_use' type, e.g., Read, Edit, Bash)")
    input: dict[str, Any] | None = Field(None, description="Tool input parameters (for 'tool_use' type)")
    tool_use_id: str | None = Field(
        None,
        alias="tool_use_id",
        description="Unique ID linking tool_use to its tool_result"
    )
    content: str | list[Any] | None = Field(
        None,
        description="Tool result content (for 'tool_result' type)"
    )


class MessageContent(BaseModel):
    """The content portion of a message."""
    role: str = Field(description="Message role: 'user' or 'assistant'")
    content: str | list[ContentBlock] = Field(
        description="Simple string for user messages, or array of ContentBlocks for assistant messages"
    )


class Message(BaseModel):
    """A message entry in a session transcript."""
    uuid: str = Field(description="Unique identifier for this message within the session")
    parent_uuid: str | None = Field(
        None,
        alias="parentUuid",
        description="UUID of the message this responds to (creates conversation thread)"
    )
    type: str = Field(
        description="Entry type: 'user', 'assistant', 'file-history-snapshot', 'progress', or 'result'"
    )
    timestamp: str = Field(description="ISO 8601 timestamp when message was created")
    session_id: str = Field(
        alias="sessionId",
        description="Session UUID this message belongs to"
    )
    content: MessageContent = Field(description="Message content with role and text/blocks")
    model: str | None = Field(
        None,
        description="For assistant messages, the Claude model that generated the response"
    )
    cwd: str | None = Field(
        None,
        description="Working directory at time of message"
    )
    git_branch: str | None = Field(
        None,
        alias="gitBranch",
        description="Active git branch at time of message"
    )

    class Config:
        populate_by_name = True


# Activity (for /projects/{path}/activity)
class DailyProjectActivity(BaseModel):
    """Activity summary for a single day within a project."""
    date: str = Field(description="Date in YYYY-MM-DD format")
    sessions: list[Session] = Field(description="Sessions active on this date")
    total_messages: int = Field(
        alias="totalMessages",
        description="Sum of message counts across all sessions on this date"
    )
    session_count: int = Field(
        alias="sessionCount",
        description="Number of sessions on this date"
    )

    class Config:
        populate_by_name = True


class ActivitySummaryStats(BaseModel):
    """Aggregate statistics for activity timeline."""
    total_sessions: int = Field(
        alias="totalSessions",
        description="Total sessions in the timeline period"
    )
    total_messages: int = Field(
        alias="totalMessages",
        description="Total messages across all sessions in the period"
    )
    max_daily_messages: int = Field(
        alias="maxDailyMessages",
        description="Highest message count on a single day (useful for chart scaling)"
    )

    class Config:
        populate_by_name = True


class ActivityResponse(BaseModel):
    """Response for project activity timeline endpoint."""
    data: list[DailyProjectActivity] = Field(
        description="Daily activity entries sorted by date descending"
    )
    summary: ActivitySummaryStats = Field(description="Aggregate statistics for the period")


# Global Activity (cross-project)
class GlobalSession(Session):
    """Session with project information for cross-project views."""
    project_id: str = Field(
        alias="projectId",
        description="Project identifier for API routing"
    )
    project_name: str = Field(
        alias="projectName",
        description="Project directory name"
    )


class GlobalDailyActivity(BaseModel):
    """Activity summary for a single day across all projects."""
    date: str = Field(description="Date in YYYY-MM-DD format")
    sessions: list[GlobalSession] = Field(
        description="Sessions active on this date across all projects"
    )
    total_messages: int = Field(
        alias="totalMessages",
        description="Sum of message counts across all sessions on this date"
    )
    session_count: int = Field(
        alias="sessionCount",
        description="Number of sessions on this date"
    )

    class Config:
        populate_by_name = True


class GlobalActivityResponse(BaseModel):
    """Response for cross-project activity timeline endpoint."""
    data: list[GlobalDailyActivity] = Field(
        description="Daily activity entries sorted by date descending"
    )
    summary: ActivitySummaryStats = Field(description="Aggregate statistics for the period")


class DateRange(BaseModel):
    """Date range for activity queries."""
    start: str = Field(description="Start date in YYYY-MM-DD format")
    end: str = Field(description="End date in YYYY-MM-DD format")


class ProjectBreakdown(BaseModel):
    """Activity breakdown for a single project."""
    project: str = Field(description="Project name")
    project_id: str = Field(
        alias="projectId",
        description="Project identifier for API routing"
    )
    sessions: int = Field(description="Number of sessions in this project")
    messages: int = Field(description="Total messages in this project")

    class Config:
        populate_by_name = True


class DailyBreakdown(BaseModel):
    """Activity breakdown for a single day."""
    date: str = Field(description="Date in YYYY-MM-DD format")
    sessions: int = Field(description="Number of sessions on this date")
    messages: int = Field(description="Total messages on this date")


class GlobalActivitySummary(BaseModel):
    """Aggregated activity summary across all projects."""
    date_range: DateRange = Field(
        alias="dateRange",
        description="The date range for this summary"
    )
    total_sessions: int = Field(
        alias="totalSessions",
        description="Total sessions across all projects"
    )
    total_messages: int = Field(
        alias="totalMessages",
        description="Total messages across all projects"
    )
    project_breakdown: list[ProjectBreakdown] = Field(
        alias="projectBreakdown",
        description="Activity breakdown by project"
    )
    daily_breakdown: list[DailyBreakdown] = Field(
        alias="dailyBreakdown",
        description="Activity breakdown by date"
    )

    class Config:
        populate_by_name = True


# Sub-agents
class SubAgentResponse(BaseModel):
    """Sub-agent relationship information for a session."""
    parent_session_id: str | None = Field(
        None,
        alias="parentSessionId",
        description="If this is a sub-agent session, the UUID of the parent session"
    )
    sub_agents: list[Session] = Field(
        alias="subAgents",
        description="List of sub-agent sessions spawned by this session"
    )

    class Config:
        populate_by_name = True


# File backup content
class FileBackupContent(BaseModel):
    """Content of a file backup from file history."""
    backup_file_name: str = Field(
        alias="backupFileName",
        description="Backup filename in format {contentHash}@v{version}"
    )
    content: str = Field(description="Raw file content at time of backup")
    size: int = Field(description="File size in bytes")


# Shell snapshots
class ShellSnapshot(BaseModel):
    """A shell environment snapshot."""
    filename: str = Field(
        description="Snapshot filename (e.g., snapshot-zsh-1752622750085-qza877.sh)"
    )
    shell: str | None = Field(
        None,
        description="Shell type extracted from filename (e.g., 'zsh', 'bash')"
    )
    timestamp: int | None = Field(
        None,
        description="Unix timestamp in milliseconds extracted from filename"
    )


# Plans
class Plan(BaseModel):
    """A plan document from plan mode.

    Plans have auto-generated whimsical names (e.g., cosmic-plotting-bunny.md).
    """
    name: str = Field(
        description="Plan filename (e.g., 'cosmic-plotting-bunny.md')"
    )
    content: str | None = Field(
        None,
        description="Full markdown content of the plan"
    )


# Skills
class Skill(BaseModel):
    """A skill definition.

    Skills contain a SKILL.md file with YAML frontmatter defining
    name, description, and allowed-tools.
    """
    name: str = Field(description="Skill name (invoked with /skill-name)")
    description: str | None = Field(
        None,
        description="Description from SKILL.md YAML frontmatter"
    )
    allowed_tools: list[str] | None = Field(
        None,
        alias="allowedTools",
        description="Tools this skill can use (from 'allowed-tools' in frontmatter)"
    )
    content: str | None = Field(
        None,
        description="Full content of SKILL.md file including frontmatter"
    )
    is_symlink: bool | None = Field(
        None,
        alias="isSymlink",
        description="True if skill directory is a symlink"
    )
    real_path: str | None = Field(
        None,
        alias="realPath",
        description="Resolved absolute path if skill is a symlink"
    )

    class Config:
        populate_by_name = True


# Commands
class Command(BaseModel):
    """A simple slash command.

    Commands are markdown files with YAML frontmatter defining
    name and description. Invoked with /command-name.
    """
    name: str = Field(
        description="Command filename without .md extension (invoked with /command-name)"
    )
    description: str | None = Field(
        None,
        description="Description from YAML frontmatter"
    )
    content: str | None = Field(
        None,
        description="Full markdown content including YAML frontmatter"
    )


# Plugins
class Plugin(BaseModel):
    """An installed plugin."""
    name: str = Field(description="Plugin identifier (format: plugin-name@marketplace)")
    version: str = Field(description="Installed plugin version string")
    scope: str | None = Field(
        None,
        description="Installation scope: 'user' (global) or 'project' (local)"
    )
    install_path: str | None = Field(
        None,
        alias="installPath",
        description="Absolute path to installed plugin files"
    )
    installed_at: str | None = Field(
        None,
        alias="installedAt",
        description="ISO 8601 timestamp when plugin was installed"
    )
    git_commit_sha: str | None = Field(
        None,
        alias="gitCommitSha",
        description="Git commit SHA of the installed plugin version"
    )
    skills: list[str] | None = Field(
        None,
        description="List of skill names provided by this plugin"
    )

    class Config:
        populate_by_name = True


# Stats
class LongestSession(BaseModel):
    """Details of the session with the most messages."""
    session_id: str | None = Field(
        None,
        alias="sessionId",
        description="UUID of the longest session"
    )
    duration: int | None = Field(
        None,
        description="Session duration in milliseconds"
    )
    message_count: int | None = Field(
        None,
        alias="messageCount",
        description="Number of messages in the session"
    )

    class Config:
        populate_by_name = True


class Stats(BaseModel):
    """Aggregated usage statistics from stats cache."""
    version: int | None = Field(
        None,
        description="Stats cache schema version"
    )
    last_computed_date: str | None = Field(
        None,
        alias="lastComputedDate",
        description="Date (YYYY-MM-DD) when stats were last computed"
    )
    total_sessions: int | None = Field(
        None,
        alias="totalSessions",
        description="Total number of sessions across all projects"
    )
    total_messages: int | None = Field(
        None,
        alias="totalMessages",
        description="Total messages across all sessions"
    )
    first_session_date: str | None = Field(
        None,
        alias="firstSessionDate",
        description="ISO 8601 timestamp of the oldest session"
    )
    longest_session: LongestSession | None = Field(
        None,
        alias="longestSession",
        description="Details of the session with the most messages"
    )
    hour_counts: dict[str, int] | None = Field(
        None,
        alias="hourCounts",
        description="Message counts by hour of day (keys: '0'-'23', values: counts)"
    )

    class Config:
        populate_by_name = True


# DailyActivity (for /stats/daily) - NOT the same as DailyProjectActivity
class DailyActivity(BaseModel):
    """Global daily activity statistics (not project-specific)."""
    date: str = Field(description="Date in YYYY-MM-DD format")
    message_count: int = Field(
        alias="messageCount",
        description="Total messages across all projects on this date"
    )
    session_count: int = Field(
        alias="sessionCount",
        description="Total sessions across all projects on this date"
    )
    tool_call_count: int = Field(
        alias="toolCallCount",
        description="Total tool invocations on this date"
    )

    class Config:
        populate_by_name = True


class ModelUsage(BaseModel):
    """Token usage statistics for a specific Claude model."""
    input_tokens: int = Field(
        alias="inputTokens",
        description="Total input tokens sent to this model"
    )
    output_tokens: int = Field(
        alias="outputTokens",
        description="Total output tokens received from this model"
    )
    cache_read_input_tokens: int = Field(
        alias="cacheReadInputTokens",
        description="Input tokens read from prompt cache (reduces cost)"
    )
    cache_creation_input_tokens: int = Field(
        alias="cacheCreationInputTokens",
        description="Input tokens used to create new cache entries"
    )

    class Config:
        populate_by_name = True


# Response wrappers for OpenAPI schema generation
class DailyActivityResponse(BaseModel):
    """Response wrapper for daily activity statistics."""
    data: list[DailyActivity] = Field(
        description="Daily activity entries sorted by date descending"
    )


class ModelUsageResponse(BaseModel):
    """Response wrapper for model usage statistics."""
    data: dict[str, ModelUsage] = Field(
        description="Token usage by model ID (e.g., 'claude-opus-4-5-20251101')"
    )


# History
class HistoryEntry(BaseModel):
    """A prompt entry from history.

    Chronological log of all user prompts across projects.
    """
    display: str = Field(description="User's prompt text as displayed")
    timestamp: int = Field(description="Unix timestamp in milliseconds")
    project_path: str | None = Field(
        None,
        alias="projectPath",
        description="Absolute path to project where prompt was entered"
    )
    project_id: str | None = Field(
        None,
        alias="projectId",
        description="Encoded project path for URL routing (e.g., '-Users-sam-Projects-foo')"
    )
    pasted_contents: dict[str, Any] | None = Field(
        None,
        alias="pastedContents",
        description="Pasted content attached to the prompt (files, images, etc.)"
    )

    class Config:
        populate_by_name = True


class HistoryResponse(BaseModel):
    """Response for prompt history endpoint."""
    data: list[HistoryEntry] = Field(
        description="Prompt history entries sorted by timestamp descending"
    )
    meta: PaginationMeta = Field(description="Pagination metadata")


# Files
class FileEntry(BaseModel):
    """A file or directory entry when browsing Claude data."""
    name: str = Field(description="File or directory name")
    is_directory: bool = Field(
        alias="isDirectory",
        description="True if this entry is a directory"
    )

    class Config:
        populate_by_name = True


class FileContent(BaseModel):
    """File or directory content when browsing Claude data."""
    type: str = Field(description="Entry type: 'file' or 'directory'")
    path: str = Field(description="Relative path within Claude data directory")
    content: str | None = Field(
        None,
        description="File content as string (for files, max 100KB)"
    )
    entries: list[FileEntry] | None = Field(
        None,
        description="Child entries (for directories)"
    )
    error: str | None = Field(
        None,
        description="Error message if content could not be read"
    )


# Error response
class Error(BaseModel):
    """Standard error response."""
    code: str = Field(description="Error code for programmatic handling (e.g., 'NOT_FOUND', 'INVALID_PATH')")
    message: str = Field(description="Human-readable error message")
    details: dict[str, Any] | None = Field(
        None,
        description="Additional error context and debugging information"
    )


# Config (read-only, redacted)
class ClaudeConfig(BaseModel):
    """Claude configuration.

    Contains user preferences, OAuth tokens (redacted), MCP servers,
    per-project settings, and feature flags. Sensitive data is redacted.
    """
    model_config = {"extra": "allow"}  # Allow any fields since config is dynamic


# Settings
class ClaudeSettings(BaseModel):
    """User settings.

    Contains permissions, model selection, hooks configuration,
    status line settings, and enabled plugins.
    """
    model_config = {"extra": "allow"}  # Allow any fields since settings are dynamic
