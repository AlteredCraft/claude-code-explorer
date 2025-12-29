import { Router, Request, Response } from 'express';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

// GET /sessions/:sessionId/correlated - Get all correlated data
router.get('/:sessionId/correlated', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const [todos, fileHistory, debugLogs, linkedPlan, linkedSkill] = await Promise.all([
      findSessionTodos(sessionId),
      findSessionFileHistory(sessionId),
      findSessionDebugLogs(sessionId),
      findLinkedPlan(sessionId),
      findLinkedSkill(sessionId)
    ]);

    res.json({
      todos,
      fileHistory,
      debugLogs,
      linkedPlan,
      linkedSkill
    });
  } catch (error) {
    console.error('Error getting correlated data:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get correlated data'
    });
  }
});

// GET /sessions/:sessionId/todos - Get todos for a session
router.get('/:sessionId/todos', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const todos = await findSessionTodos(sessionId);

    res.json({ data: todos });
  } catch (error) {
    console.error('Error getting todos:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get todos'
    });
  }
});

// GET /sessions/:sessionId/file-history - Get file history
router.get('/:sessionId/file-history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const fileHistory = await findSessionFileHistory(sessionId);

    res.json({ data: fileHistory });
  } catch (error) {
    console.error('Error getting file history:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get file history'
    });
  }
});

// GET /sessions/:sessionId/debug-logs - Get debug logs
router.get('/:sessionId/debug-logs', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const debugLogs = await findSessionDebugLogs(sessionId);

    res.json({ data: debugLogs });
  } catch (error) {
    console.error('Error getting debug logs:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get debug logs'
    });
  }
});

// Helper functions
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

async function findLinkedSkill(sessionId: string): Promise<string | undefined> {
  // TODO: Detect skill usage from session messages
  return undefined;
}

export { router as correlatedRouter };
