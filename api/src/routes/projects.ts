import { Router, Request, Response } from 'express';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

// Helper functions (copied from lib for standalone API)
function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

function getClaudeConfigPath(): string {
  return join(homedir(), '.claude.json');
}

function decodeProjectPath(encoded: string): string {
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

function encodeProjectPath(path: string): string {
  return path.replace(/\//g, '-');
}

function getDisplayPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

function getProjectName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function buildPathLookup(config: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  const projects = config.projects as Record<string, unknown> | undefined;
  if (projects) {
    for (const realPath of Object.keys(projects)) {
      const encoded = encodeProjectPath(realPath);
      lookup.set(encoded, realPath);
    }
  }
  return lookup;
}

async function getClaudeConfig(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(getClaudeConfigPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

interface ProjectConfig {
  allowedTools?: string[];
  lastCost?: number;
  lastDuration?: number;
  lastSessionId?: string;
  lastTotalInputTokens?: number;
  lastTotalOutputTokens?: number;
}

interface SessionFile {
  name: string;
  mtime: Date;
}

async function getSessionFiles(encodedProjectPath: string): Promise<SessionFile[]> {
  const claudeDir = getClaudeDir();
  const projectDir = join(claudeDir, 'projects', encodedProjectPath);

  try {
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    const filesWithStats = await Promise.all(
      jsonlFiles.map(async (name) => {
        const fileStat = await stat(join(projectDir, name));
        return { name, mtime: fileStat.mtime };
      })
    );

    return filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

// GET /projects - List all projects
router.get('/', async (req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const projectsDir = join(claudeDir, 'projects');

    const entries = await readdir(projectsDir, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory());

    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);
    const configProjects = config.projects as Record<string, ProjectConfig> | undefined;

    const projects = await Promise.all(
      projectDirs.map(async (dir) => {
        const decodedPath = pathLookup.get(dir.name) ?? decodeProjectPath(dir.name);
        const projectConfig = configProjects?.[decodedPath];
        const sessionFiles = await getSessionFiles(dir.name);

        let lastActivity: string | undefined;
        if (sessionFiles.length > 0) {
          lastActivity = sessionFiles[0].mtime.toISOString();
        }

        return {
          path: decodedPath,
          encodedPath: dir.name,
          displayPath: getDisplayPath(decodedPath),
          name: getProjectName(decodedPath),
          sessionCount: sessionFiles.length,
          lastSessionId: projectConfig?.lastSessionId,
          lastActivity,
          lastCost: projectConfig?.lastCost,
          lastDuration: projectConfig?.lastDuration,
          lastTotalInputTokens: projectConfig?.lastTotalInputTokens,
          lastTotalOutputTokens: projectConfig?.lastTotalOutputTokens,
        };
      })
    );

    // Sort by last activity
    const sortBy = (req.query.sortBy as string) || 'lastActivity';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    projects.sort((a, b) => {
      let aVal: string | number | undefined;
      let bVal: string | number | undefined;

      if (sortBy === 'lastActivity') {
        aVal = a.lastActivity || '';
        bVal = b.lastActivity || '';
      } else if (sortBy === 'name') {
        aVal = a.name;
        bVal = b.name;
      } else if (sortBy === 'sessionCount') {
        aVal = a.sessionCount;
        bVal = b.sessionCount;
      }

      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    // Pagination
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const paginatedProjects = projects.slice(offset, offset + limit);

    res.json({
      data: paginatedProjects,
      meta: {
        total: projects.length,
        limit,
        offset,
        hasMore: offset + limit < projects.length
      }
    });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to list projects'
    });
  }
});

// GET /projects/:encodedPath - Get project details
router.get('/:encodedPath', async (req: Request, res: Response) => {
  try {
    const { encodedPath } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);

    const claudeDir = getClaudeDir();
    const projectDir = join(claudeDir, 'projects', decodedEncodedPath);

    // Check if project exists
    try {
      await stat(projectDir);
    } catch {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: `Project not found: ${decodedEncodedPath}`
      });
    }

    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);
    const decodedPath = pathLookup.get(decodedEncodedPath) ?? decodeProjectPath(decodedEncodedPath);
    const configProjects = config.projects as Record<string, ProjectConfig> | undefined;
    const projectConfig = configProjects?.[decodedPath];
    const sessionFiles = await getSessionFiles(decodedEncodedPath);

    let lastActivity: string | undefined;
    if (sessionFiles.length > 0) {
      lastActivity = sessionFiles[0].mtime.toISOString();
    }

    // Get recent sessions with details
    const recentSessions = await Promise.all(
      sessionFiles.slice(0, 10).map(async (file) => {
        const sessionId = file.name.replace('.jsonl', '');
        const bounds = await getSessionBounds(decodedEncodedPath, file.name);

        return {
          id: sessionId,
          projectPath: decodedPath,
          startTime: bounds.startTime.toISOString(),
          endTime: bounds.endTime?.toISOString(),
          messageCount: bounds.messageCount,
          model: bounds.model,
          isAgent: sessionId.startsWith('agent-'),
        };
      })
    );

    // Calculate activity summary
    let totalMessages = 0;
    let totalAgentSessions = 0;
    for (const file of sessionFiles) {
      const sessionId = file.name.replace('.jsonl', '');
      if (sessionId.startsWith('agent-')) {
        totalAgentSessions++;
      }
      const bounds = await getSessionBounds(decodedEncodedPath, file.name);
      totalMessages += bounds.messageCount;
    }

    const firstSession = sessionFiles.length > 0
      ? sessionFiles[sessionFiles.length - 1].mtime.toISOString()
      : undefined;

    res.json({
      path: decodedPath,
      encodedPath: decodedEncodedPath,
      displayPath: getDisplayPath(decodedPath),
      name: getProjectName(decodedPath),
      sessionCount: sessionFiles.length,
      lastSessionId: projectConfig?.lastSessionId,
      lastActivity,
      lastCost: projectConfig?.lastCost,
      lastDuration: projectConfig?.lastDuration,
      lastTotalInputTokens: projectConfig?.lastTotalInputTokens,
      lastTotalOutputTokens: projectConfig?.lastTotalOutputTokens,
      recentSessions,
      activitySummary: {
        totalMessages,
        totalAgentSessions,
        dateRange: {
          start: firstSession,
          end: lastActivity
        }
      }
    });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get project details'
    });
  }
});

// GET /projects/:encodedPath/sessions - List sessions for a project
router.get('/:encodedPath/sessions', async (req: Request, res: Response) => {
  try {
    const { encodedPath } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);
    const typeFilter = req.query.type as string || 'all';

    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);
    const decodedPath = pathLookup.get(decodedEncodedPath) ?? decodeProjectPath(decodedEncodedPath);
    const sessionFiles = await getSessionFiles(decodedEncodedPath);

    let sessions = await Promise.all(
      sessionFiles.map(async (file) => {
        const sessionId = file.name.replace('.jsonl', '');
        const bounds = await getSessionBounds(decodedEncodedPath, file.name);

        return {
          id: sessionId,
          projectPath: decodedPath,
          startTime: bounds.startTime.toISOString(),
          endTime: bounds.endTime?.toISOString(),
          messageCount: bounds.messageCount,
          model: bounds.model,
          isAgent: sessionId.startsWith('agent-'),
        };
      })
    );

    // Filter by type
    if (typeFilter === 'regular') {
      sessions = sessions.filter(s => !s.isAgent);
    } else if (typeFilter === 'agent') {
      sessions = sessions.filter(s => s.isAgent);
    }

    // Pagination
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const paginatedSessions = sessions.slice(offset, offset + limit);

    res.json({
      data: paginatedSessions,
      meta: {
        total: sessions.length,
        limit,
        offset,
        hasMore: offset + limit < sessions.length
      }
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to list sessions'
    });
  }
});

// GET /projects/:encodedPath/sessions/:sessionId - Get session details
router.get('/:encodedPath/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { encodedPath, sessionId } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);

    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);
    const decodedPath = pathLookup.get(decodedEncodedPath) ?? decodeProjectPath(decodedEncodedPath);

    const claudeDir = getClaudeDir();
    const filename = sessionId.endsWith('.jsonl') ? sessionId : `${sessionId}.jsonl`;
    const filePath = join(claudeDir, 'projects', decodedEncodedPath, filename);

    // Check if session exists
    try {
      await stat(filePath);
    } catch {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: `Session not found: ${sessionId}`
      });
    }

    const bounds = await getSessionBounds(decodedEncodedPath, filename);
    const metadata = await getSessionMetadata(decodedEncodedPath, sessionId);
    const correlatedData = await getCorrelatedData(sessionId);

    res.json({
      id: sessionId,
      projectPath: decodedPath,
      startTime: bounds.startTime.toISOString(),
      endTime: bounds.endTime?.toISOString(),
      messageCount: bounds.messageCount,
      model: bounds.model,
      isAgent: sessionId.startsWith('agent-'),
      duration: bounds.endTime ? bounds.endTime.getTime() - bounds.startTime.getTime() : undefined,
      metadata,
      correlatedData
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get session details'
    });
  }
});

// GET /projects/:encodedPath/sessions/:sessionId/messages - List messages
router.get('/:encodedPath/sessions/:sessionId/messages', async (req: Request, res: Response) => {
  try {
    const { encodedPath, sessionId } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);
    const typeFilter = req.query.type as string || 'all';

    let messages = await getSessionMessages(decodedEncodedPath, sessionId);

    // Filter by type
    if (typeFilter === 'user') {
      messages = messages.filter(m => m.type === 'user');
    } else if (typeFilter === 'assistant') {
      messages = messages.filter(m => m.type === 'assistant');
    }

    // Pagination
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const paginatedMessages = messages.slice(offset, offset + limit);

    res.json({
      data: paginatedMessages,
      meta: {
        total: messages.length,
        limit,
        offset,
        hasMore: offset + limit < messages.length
      }
    });
  } catch (error) {
    console.error('Error listing messages:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to list messages'
    });
  }
});

// GET /projects/:encodedPath/sessions/:sessionId/messages/:messageId - Get message
router.get('/:encodedPath/sessions/:sessionId/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const { encodedPath, sessionId, messageId } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);

    const messages = await getSessionMessages(decodedEncodedPath, sessionId);
    const message = messages.find(m => m.uuid === messageId);

    if (!message) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: `Message not found: ${messageId}`
      });
    }

    res.json(message);
  } catch (error) {
    console.error('Error getting message:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get message'
    });
  }
});

// GET /projects/:encodedPath/activity - Get activity timeline
router.get('/:encodedPath/activity', async (req: Request, res: Response) => {
  try {
    const { encodedPath } = req.params;
    const decodedEncodedPath = decodeURIComponent(encodedPath);
    const days = Math.min(parseInt(req.query.days as string) || 14, 90);
    const typeFilter = req.query.type as string || 'regular';

    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);
    const decodedPath = pathLookup.get(decodedEncodedPath) ?? decodeProjectPath(decodedEncodedPath);
    const sessionFiles = await getSessionFiles(decodedEncodedPath);

    // Get all sessions with their start times
    let sessions = await Promise.all(
      sessionFiles.map(async (file) => {
        const sessionId = file.name.replace('.jsonl', '');
        const bounds = await getSessionBounds(decodedEncodedPath, file.name);

        return {
          id: sessionId,
          projectPath: decodedPath,
          startTime: bounds.startTime,
          endTime: bounds.endTime,
          messageCount: bounds.messageCount,
          model: bounds.model,
          isAgent: sessionId.startsWith('agent-'),
        };
      })
    );

    // Filter by type
    if (typeFilter === 'regular') {
      sessions = sessions.filter(s => !s.isAgent);
    } else if (typeFilter === 'agent') {
      sessions = sessions.filter(s => s.isAgent);
    }

    // Group by day
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const dailyMap = new Map<string, { sessions: typeof sessions; totalMessages: number }>();

    for (const session of sessions) {
      if (session.startTime < cutoff) continue;

      const dateStr = session.startTime.toISOString().split('T')[0];
      const existing = dailyMap.get(dateStr) || { sessions: [], totalMessages: 0 };
      existing.sessions.push(session);
      existing.totalMessages += session.messageCount;
      dailyMap.set(dateStr, existing);
    }

    // Convert to array and sort
    const dailyActivity = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      sessions: data.sessions.map(s => ({
        ...s,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString()
      })),
      totalMessages: data.totalMessages,
      sessionCount: data.sessions.length
    })).sort((a, b) => b.date.localeCompare(a.date));

    // Calculate summary
    let totalSessions = 0;
    let totalMessages = 0;
    let maxDailyMessages = 0;

    for (const day of dailyActivity) {
      totalSessions += day.sessionCount;
      totalMessages += day.totalMessages;
      maxDailyMessages = Math.max(maxDailyMessages, day.totalMessages);
    }

    res.json({
      data: dailyActivity,
      summary: {
        totalSessions,
        totalMessages,
        maxDailyMessages
      }
    });
  } catch (error) {
    console.error('Error getting activity:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get project activity'
    });
  }
});

// Helper: Get session time bounds
async function getSessionBounds(
  encodedProjectPath: string,
  filename: string
): Promise<{ startTime: Date; endTime?: Date; messageCount: number; model?: string }> {
  const claudeDir = getClaudeDir();
  const filePath = join(claudeDir, 'projects', encodedProjectPath, filename);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    let startTime = new Date();
    let endTime: Date | undefined;
    let messageCount = 0;
    let model: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.type === 'file-history-snapshot') continue;
        messageCount++;

        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : null;

        if (i === 0 && timestamp) {
          startTime = timestamp;
        }
        if (timestamp) {
          endTime = timestamp;
        }
        if (parsed.type === 'assistant' && parsed.message?.model) {
          model = parsed.message.model;
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { startTime, endTime, messageCount, model };
  } catch {
    return { startTime: new Date(), messageCount: 0 };
  }
}

// Helper: Get session messages
async function getSessionMessages(
  encodedProjectPath: string,
  sessionId: string
): Promise<Array<{
  uuid: string;
  parentUuid: string | null;
  type: string;
  timestamp: string;
  sessionId: string;
  content: unknown;
  model?: string;
  cwd?: string;
  gitBranch?: string;
}>> {
  const claudeDir = getClaudeDir();
  const filename = sessionId.endsWith('.jsonl') ? sessionId : `${sessionId}.jsonl`;
  const filePath = join(claudeDir, 'projects', encodedProjectPath, filename);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    const messages: Array<{
      uuid: string;
      parentUuid: string | null;
      type: string;
      timestamp: string;
      sessionId: string;
      content: unknown;
      model?: string;
      cwd?: string;
      gitBranch?: string;
    }> = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (!parsed.type || parsed.type === 'file-history-snapshot') continue;
        if (!parsed.timestamp) continue;

        const timestamp = new Date(parsed.timestamp);
        if (isNaN(timestamp.getTime())) continue;

        messages.push({
          uuid: parsed.uuid || parsed.messageId,
          parentUuid: parsed.parentUuid || null,
          type: parsed.type,
          timestamp: timestamp.toISOString(),
          sessionId: parsed.sessionId || sessionId,
          content: parsed.message || { role: parsed.type, content: '' },
          model: parsed.message?.model,
          cwd: parsed.cwd,
          gitBranch: parsed.gitBranch,
        });
      } catch {
        // Skip malformed lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

// Helper: Get session metadata
async function getSessionMetadata(
  encodedProjectPath: string,
  sessionId: string
): Promise<{ totalTokens: number; model?: string; toolsUsed: string[] }> {
  const messages = await getSessionMessages(encodedProjectPath, sessionId);
  const toolsUsed = new Set<string>();
  let model: string | undefined;

  for (const msg of messages) {
    if (msg.model) model = msg.model;

    if (msg.type === 'assistant' && typeof msg.content === 'object' && msg.content !== null) {
      const content = msg.content as { content?: unknown[] };
      if (Array.isArray(content.content)) {
        for (const block of content.content) {
          if (typeof block === 'object' && block !== null) {
            const b = block as { type?: string; name?: string };
            if (b.type === 'tool_use' && b.name) {
              toolsUsed.add(b.name);
            }
          }
        }
      }
    }
  }

  return {
    totalTokens: 0,
    model,
    toolsUsed: Array.from(toolsUsed),
  };
}

// Helper: Get correlated data
async function getCorrelatedData(sessionId: string): Promise<{
  todos: Array<{ content: string; status: string }>;
  fileHistory: Array<{ path: string; action: string; timestamp: string }>;
  debugLogs: string[];
  linkedPlan?: string;
  linkedSkill?: string;
}> {
  const [todos, fileHistory, debugLogs, linkedPlan] = await Promise.all([
    findSessionTodos(sessionId),
    findSessionFileHistory(sessionId),
    findSessionDebugLogs(sessionId),
    findLinkedPlan(sessionId)
  ]);

  return {
    todos,
    fileHistory,
    debugLogs,
    linkedPlan
  };
}

async function findSessionTodos(sessionId: string): Promise<Array<{ content: string; status: string }>> {
  const claudeDir = getClaudeDir();
  const todosDir = join(claudeDir, 'todos');

  try {
    const entries = await readdir(todosDir, { withFileTypes: true });
    const matching = entries.filter(e => e.name.startsWith(sessionId));
    const todos: Array<{ content: string; status: string }> = [];

    for (const entry of matching) {
      const entryPath = join(todosDir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const content = await readFile(entryPath, 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data.todos)) {
            todos.push(...data.todos);
          } else if (data.content && data.status) {
            todos.push(data);
          }
        } catch {
          // Skip malformed files
        }
      } else if (entry.isDirectory()) {
        const subFiles = await readdir(entryPath);
        for (const subFile of subFiles) {
          if (subFile.endsWith('.json')) {
            try {
              const content = await readFile(join(entryPath, subFile), 'utf-8');
              const data = JSON.parse(content);
              if (Array.isArray(data.todos)) {
                todos.push(...data.todos);
              } else if (data.content && data.status) {
                todos.push(data);
              }
            } catch {
              // Skip malformed files
            }
          }
        }
      }
    }

    return todos;
  } catch {
    return [];
  }
}

async function findSessionFileHistory(sessionId: string): Promise<Array<{ path: string; action: string; timestamp: string }>> {
  const claudeDir = getClaudeDir();
  const fileHistoryDir = join(claudeDir, 'file-history', sessionId);

  try {
    const files = await readdir(fileHistoryDir);
    const entries: Array<{ path: string; action: string; timestamp: string }> = [];

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.jsonl')) {
        try {
          const content = await readFile(join(fileHistoryDir, file), 'utf-8');

          if (file.endsWith('.jsonl')) {
            const lines = content.trim().split('\n');
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.path) {
                  entries.push({
                    path: data.path,
                    action: data.action || 'read',
                    timestamp: new Date(data.timestamp || Date.now()).toISOString(),
                  });
                }
              } catch {
                // Skip malformed lines
              }
            }
          } else {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              for (const item of data) {
                if (item.path) {
                  entries.push({
                    path: item.path,
                    action: item.action || 'read',
                    timestamp: new Date(item.timestamp || Date.now()).toISOString(),
                  });
                }
              }
            }
          }
        } catch {
          // Skip malformed files
        }
      }
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    return [];
  }
}

async function findSessionDebugLogs(sessionId: string): Promise<string[]> {
  const claudeDir = getClaudeDir();
  const debugDir = join(claudeDir, 'debug');

  try {
    const files = await readdir(debugDir);
    const matching = files.filter(f =>
      f.includes(sessionId) || f.startsWith(sessionId.slice(0, 8))
    );

    const logs: string[] = [];

    for (const file of matching.slice(0, 5)) {
      try {
        const content = await readFile(join(debugDir, file), 'utf-8');
        logs.push(content.slice(0, 5000));
      } catch {
        // Skip unreadable files
      }
    }

    return logs;
  } catch {
    return [];
  }
}

async function findLinkedPlan(sessionId: string): Promise<string | undefined> {
  const claudeDir = getClaudeDir();
  const plansDir = join(claudeDir, 'plans');

  try {
    const files = await readdir(plansDir);
    const planFiles = files.filter(f => f.endsWith('.md'));

    for (const planFile of planFiles) {
      try {
        const content = await readFile(join(plansDir, planFile), 'utf-8');
        if (content.includes(sessionId)) {
          return planFile;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export { router as projectsRouter };
