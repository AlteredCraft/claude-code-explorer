// API Client for Claude Explorer REST API
// This client fetches data from the standalone API server

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// Project types
export interface Project {
  path: string;
  projectId: string;
  displayPath: string;
  name: string;
  sessionCount: number;
  hasSessionData: boolean;
  isOrphan: boolean;
  lastSessionId?: string;
  lastActivity?: string;
  lastCost?: number;
  lastDuration?: number;
  lastTotalInputTokens?: number;
  lastTotalOutputTokens?: number;
}

export interface ProjectDetail extends Project {
  recentSessions: Session[];
  activitySummary: {
    totalMessages: number;
    totalAgentSessions: number;
    dateRange: {
      start?: string;
      end?: string;
    };
  };
}

// Session types
export interface Session {
  id: string;
  projectPath: string;
  startTime: string;
  endTime?: string;
  messageCount: number;
  model?: string;
  isAgent: boolean;
  parentSessionId?: string | null;
  subAgentIds?: string[];
}

export interface SubAgentResponse {
  parentSessionId: string | null;
  subAgents: Session[];
}

export interface SessionDetail extends Session {
  duration?: number;
  metadata: SessionMetadata;
  correlatedData: CorrelatedData;
}

export interface SessionMetadata {
  totalTokens: number;
  model?: string;
  toolsUsed: string[];
}

// Message types
export interface Message {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'progress' | 'result';
  timestamp: string;
  sessionId: string;
  content: MessageContent;
  model?: string;
  cwd?: string;
  gitBranch?: string;
}

export interface MessageContent {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | unknown[];
}

// Correlated data types
export interface CorrelatedData {
  todos: TodoItem[];
  fileHistory: FileHistoryEntry[];
  debugLogs: string[];
  linkedPlan?: string;
  linkedSkill?: string;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface FileHistoryEntry {
  filePath: string;
  backupFileName: string;
  version: number;
  backupTime?: string;
  messageId?: string;
}

export interface FileBackupContent {
  backupFileName: string;
  content: string;
  size: number;
}

// Activity types
export interface DailyActivity {
  date: string;
  sessions: Session[];
  totalMessages: number;
  sessionCount: number;
}

export interface ActivityResponse {
  data: DailyActivity[];
  summary: {
    totalSessions: number;
    totalMessages: number;
    maxDailyMessages: number;
  };
}

// File browsing types
export interface FileContent {
  type: 'file' | 'directory';
  path: string;
  content?: string;
  entries?: Array<{ name: string; isDirectory: boolean }>;
  error?: string;
}

// History types
export interface HistoryEntry {
  display: string;
  timestamp: number;
  project?: string;
  pastedContents?: Record<string, unknown>;
}

// Stats types
export interface Stats {
  version?: number;
  lastComputedDate?: string;
  totalSessions?: number;
  totalMessages?: number;
  firstSessionDate?: string;
  hourCounts?: Record<string, number>;
}

export interface DailyStats {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

// API Error
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

// Fetch wrapper with error handling
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    cache: 'no-store', // Disable Next.js caching for fresh data
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      code: 'UNKNOWN_ERROR',
      message: response.statusText,
    }));
    throw new ApiError(error.message, error.code, response.status);
  }

  return response.json();
}

// Projects API
export async function getProjects(options?: {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  pathPrefix?: string[];
}): Promise<PaginatedResponse<Project>> {
  const params = new URLSearchParams();
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.pathPrefix) {
    options.pathPrefix.forEach(p => params.append('pathPrefix', p));
  }

  const query = params.toString();
  return fetchApi(`/projects${query ? `?${query}` : ''}`);
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return fetchApi(`/projects/${encodeURIComponent(projectId)}`);
}

export async function getProjectConfig(projectId: string): Promise<{
  path: string;
  config: Record<string, unknown>;
}> {
  return fetchApi(`/projects/${encodeURIComponent(projectId)}/config`);
}

// Sessions API
export async function getProjectSessions(
  projectId: string,
  options?: {
    type?: 'regular' | 'agent' | 'all';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
): Promise<PaginatedResponse<Session>> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.sortBy) params.set('sortBy', options.sortBy);
  if (options?.sortOrder) params.set('sortOrder', options.sortOrder);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const query = params.toString();
  return fetchApi(`/projects/${encodeURIComponent(projectId)}/sessions${query ? `?${query}` : ''}`);
}

export async function getSession(
  projectId: string,
  sessionId: string
): Promise<SessionDetail> {
  return fetchApi(`/projects/${encodeURIComponent(projectId)}/sessions/${sessionId}`);
}

// Messages API
export async function getSessionMessages(
  projectId: string,
  sessionId: string,
  options?: {
    type?: 'user' | 'assistant' | 'all';
    limit?: number;
    offset?: number;
  }
): Promise<PaginatedResponse<Message>> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const query = params.toString();
  return fetchApi(
    `/projects/${encodeURIComponent(projectId)}/sessions/${sessionId}/messages${query ? `?${query}` : ''}`
  );
}

export async function getMessage(
  projectId: string,
  sessionId: string,
  messageId: string
): Promise<Message> {
  return fetchApi(
    `/projects/${encodeURIComponent(projectId)}/sessions/${sessionId}/messages/${messageId}`
  );
}

// Activity API
export async function getProjectActivity(
  projectId: string,
  options?: {
    days?: number;
    type?: 'regular' | 'agent' | 'all';
  }
): Promise<ActivityResponse> {
  const params = new URLSearchParams();
  if (options?.days) params.set('days', String(options.days));
  if (options?.type) params.set('type', options.type);

  const query = params.toString();
  return fetchApi(`/projects/${encodeURIComponent(projectId)}/activity${query ? `?${query}` : ''}`);
}

export async function getSessionSubAgents(
  projectId: string,
  sessionId: string
): Promise<SubAgentResponse> {
  return fetchApi(
    `/projects/${encodeURIComponent(projectId)}/sessions/${sessionId}/sub-agents/`
  );
}

export async function getSubAgent(
  projectId: string,
  sessionId: string,
  agentId: string
): Promise<SessionDetail> {
  return fetchApi(
    `/projects/${encodeURIComponent(projectId)}/sessions/${sessionId}/sub-agents/${agentId}`
  );
}

export async function getSessionTodos(sessionId: string): Promise<{ data: TodoItem[] }> {
  return fetchApi(`/sessions/${sessionId}/todos`);
}

export async function getSessionFileHistory(sessionId: string): Promise<{ data: FileHistoryEntry[] }> {
  return fetchApi(`/sessions/${sessionId}/file-history`);
}

export async function getFileBackupContent(
  sessionId: string,
  backupFileName: string
): Promise<FileBackupContent> {
  return fetchApi(`/sessions/${sessionId}/file-history/${encodeURIComponent(backupFileName)}`);
}

export async function getSessionDebugLogs(sessionId: string): Promise<{ data: string[] }> {
  return fetchApi(`/sessions/${sessionId}/debug-logs`);
}

export async function getSessionEnvironment(sessionId: string): Promise<{ data: Record<string, string> }> {
  return fetchApi(`/sessions/${sessionId}/environment`);
}

// Shell Snapshots API
export interface ShellSnapshot {
  filename: string;
  shell?: string;
  timestamp?: number;
}

export async function getShellSnapshots(): Promise<{ data: ShellSnapshot[] }> {
  return fetchApi('/shell-snapshots');
}

export async function getShellSnapshot(filename: string): Promise<{ filename: string; content: string }> {
  return fetchApi(`/shell-snapshots/${encodeURIComponent(filename)}`);
}

// Plans API
export async function getPlans(): Promise<{ data: string[] }> {
  return fetchApi('/plans');
}

export async function getPlan(planName: string): Promise<{ name: string; content: string }> {
  return fetchApi(`/plans/${encodeURIComponent(planName)}`);
}

// Skills API
export interface Skill {
  name: string;
  description?: string;
  allowedTools?: string[];
  content?: string;
  isSymlink?: boolean;
  realPath?: string;
}

export async function getSkills(): Promise<{ data: Skill[] }> {
  return fetchApi('/skills');
}

export async function getSkill(name: string): Promise<Skill> {
  return fetchApi(`/skills/${encodeURIComponent(name)}`);
}

// Commands API
export interface Command {
  name: string;
  description?: string;
  content?: string;
}

export async function getCommands(): Promise<{ data: Command[] }> {
  return fetchApi('/commands');
}

export async function getCommand(name: string): Promise<Command> {
  return fetchApi(`/commands/${encodeURIComponent(name)}`);
}

// Plugins API
export interface Plugin {
  name: string;
  version: string;
  scope?: string;
  installPath?: string;
  installedAt?: string;
  gitCommitSha?: string;
  skills?: string[];
}

export async function getPlugins(): Promise<{ data: Plugin[] }> {
  return fetchApi('/plugins');
}

export async function getPlugin(name: string): Promise<Plugin> {
  return fetchApi(`/plugins/${encodeURIComponent(name)}`);
}

// Stats API
export async function getStats(): Promise<Stats> {
  return fetchApi('/stats');
}

export async function getDailyStats(options?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{ data: DailyStats[] }> {
  const params = new URLSearchParams();
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return fetchApi(`/stats/daily${query ? `?${query}` : ''}`);
}

export async function getModelStats(): Promise<{ data: Record<string, ModelUsage> }> {
  return fetchApi('/stats/models');
}

// History API
export async function getHistory(options?: {
  project?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<HistoryEntry>> {
  const params = new URLSearchParams();
  if (options?.project) params.set('project', options.project);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.search) params.set('search', options.search);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const query = params.toString();
  return fetchApi(`/history${query ? `?${query}` : ''}`);
}

// Files API
export async function browseFiles(path?: string): Promise<FileContent> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);

  const query = params.toString();
  return fetchApi(`/files${query ? `?${query}` : ''}`);
}

// Config API
export async function getConfig(): Promise<Record<string, unknown>> {
  return fetchApi('/config');
}

export async function getSettings(): Promise<Record<string, unknown>> {
  return fetchApi('/config/settings');
}

// App Settings API (local Next.js API for .config/app.json)
export interface AppSettings {
  pathPrefix: string[];
}

export async function getAppSettings(): Promise<AppSettings> {
  const response = await fetch('/api/settings', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load app settings');
  }
  return response.json();
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error('Failed to save app settings');
  }
  return response.json();
}
