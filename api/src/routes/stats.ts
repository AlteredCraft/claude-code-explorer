import { Router, Request, Response } from 'express';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

// GET /stats - Get usage statistics
router.get('/', async (_req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const statsPath = join(claudeDir, 'stats-cache.json');

    try {
      const content = await readFile(statsPath, 'utf-8');
      const stats = JSON.parse(content);
      res.json(stats);
    } catch {
      // If no stats cache, compute basic stats
      const projectsDir = join(claudeDir, 'projects');
      const entries = await readdir(projectsDir, { withFileTypes: true });
      const projectDirs = entries.filter(e => e.isDirectory());

      let totalSessions = 0;
      let totalMessages = 0;

      for (const dir of projectDirs) {
        const projectPath = join(projectsDir, dir.name);
        const files = await readdir(projectPath);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
        totalSessions += sessionFiles.length;

        // Count messages in each session
        for (const file of sessionFiles) {
          try {
            const content = await readFile(join(projectPath, file), 'utf-8');
            const lines = content.trim().split('\n').filter(l => {
              try {
                const parsed = JSON.parse(l);
                return parsed.type !== 'file-history-snapshot';
              } catch {
                return false;
              }
            });
            totalMessages += lines.length;
          } catch {
            // Skip unreadable files
          }
        }
      }

      res.json({
        version: 1,
        lastComputedDate: new Date().toISOString().split('T')[0],
        totalSessions,
        totalMessages
      });
    }
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get statistics'
    });
  }
});

// GET /stats/daily - Get daily activity statistics
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const projectsDir = join(claudeDir, 'projects');
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const dailyStats = new Map<string, { messageCount: number; sessionCount: number; toolCallCount: number }>();

    const entries = await readdir(projectsDir, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory());

    for (const dir of projectDirs) {
      const projectPath = join(projectsDir, dir.name);
      const files = await readdir(projectPath);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of sessionFiles) {
        try {
          const fileStat = await stat(join(projectPath, file));
          const date = fileStat.mtime.toISOString().split('T')[0];

          if (startDate && new Date(date) < startDate) continue;
          if (endDate && new Date(date) > endDate) continue;

          const existing = dailyStats.get(date) || { messageCount: 0, sessionCount: 0, toolCallCount: 0 };
          existing.sessionCount++;

          const content = await readFile(join(projectPath, file), 'utf-8');
          const lines = content.trim().split('\n');

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'file-history-snapshot') continue;
              existing.messageCount++;

              // Count tool calls
              if (parsed.type === 'assistant' && parsed.message?.content) {
                const content = parsed.message.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'tool_use') {
                      existing.toolCallCount++;
                    }
                  }
                }
              }
            } catch {
              // Skip malformed lines
            }
          }

          dailyStats.set(date, existing);
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Convert to sorted array
    const data = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);

    res.json({ data });
  } catch (error) {
    console.error('Error getting daily stats:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to get daily statistics'
    });
  }
});

// GET /stats/models - Get model usage statistics
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const configPath = join(homedir(), '.claude.json');
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    const modelUsage: Record<string, {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    }> = {};

    // Extract model usage from project configs
    const projects = config.projects as Record<string, { lastModelUsage?: Record<string, unknown> }> | undefined;
    if (projects) {
      for (const [, projectConfig] of Object.entries(projects)) {
        const usage = projectConfig.lastModelUsage;
        if (usage) {
          for (const [model, stats] of Object.entries(usage)) {
            const s = stats as { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number };
            const existing = modelUsage[model] || {
              inputTokens: 0,
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0
            };
            existing.inputTokens += s.inputTokens || 0;
            existing.outputTokens += s.outputTokens || 0;
            existing.cacheReadInputTokens += s.cacheReadInputTokens || 0;
            existing.cacheCreationInputTokens += s.cacheCreationInputTokens || 0;
            modelUsage[model] = existing;
          }
        }
      }
    }

    res.json({ data: modelUsage });
  } catch {
    res.json({ data: {} });
  }
});

export { router as statsRouter };
