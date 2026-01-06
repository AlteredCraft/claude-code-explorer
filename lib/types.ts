// Types for Claude Code data structures

export interface Project {
  path: string;
  projectId: string;
  lastSessionId?: string;
  lastCost?: number;
  lastDuration?: number;
  lastTotalInputTokens?: number;
  lastTotalOutputTokens?: number;
  sessionCount: number;
  lastActivity?: Date;
}

export interface Session {
  id: string;
  projectPath: string;
  startTime: Date;
  endTime?: Date;
  messageCount: number;
  model?: string;
  isSubAgent: boolean;
  parentSessionId?: string | null;
  subAgentIds?: string[] | null;
}

export interface Message {
  uuid: string;
  parentUuid: string | null;
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'progress' | 'result';
  timestamp: Date;
  sessionId: string;
  content: MessageContent;
  model?: string;
  cwd?: string;
  gitBranch?: string;
  thinking?: string; // Extracted thinking content when flatten=true
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
}

export interface SessionDetail {
  session: Session;
  messages: Message[];
  metadata: SessionMetadata;
  correlatedData: CorrelatedData;
}

export interface SessionMetadata {
  totalTokens: number;
  cost?: number;
  duration?: number;
  model?: string;
  toolsUsed: string[];
}

export interface CorrelatedData {
  todos: TodoItem[];
  filesChanged: FilesChangedResponse | null;
  debugLogs: string[];
  linkedPlan?: string;
  linkedSkill?: string;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// File change tracking types
export interface FileBackup {
  backupFileName: string | null;  // null for v1 of created files
  version: number;
  backupTime?: string;
}

export interface FileChange {
  path: string;
  action: 'created' | 'modified';
  backups: FileBackup[];
}

export interface FileChangeSummary {
  created: number;
  modified: number;
  totalFiles: number;
}

export interface FilesChangedResponse {
  sessionId: string;
  summary: FileChangeSummary;
  files: FileChange[];
}

export interface ProjectConfig {
  allowedTools?: string[];
  lastCost?: number;
  lastDuration?: number;
  lastSessionId?: string;
  lastTotalInputTokens?: number;
  lastTotalOutputTokens?: number;
  lastModelUsage?: Record<string, ModelUsage>;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUSD: number;
}
