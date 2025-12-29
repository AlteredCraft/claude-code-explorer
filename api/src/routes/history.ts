import { Router, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

interface HistoryEntry {
  display: string;
  timestamp: number;
  project?: string;
  pastedContents?: Record<string, unknown>;
}

// GET /history - Get prompt history
router.get('/', async (req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const historyPath = join(claudeDir, 'history.jsonl');

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const projectFilter = req.query.project as string | undefined;
    const searchQuery = req.query.search as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string).getTime() : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string).getTime() : undefined;

    const content = await readFile(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    let entries: HistoryEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as HistoryEntry;
        entries.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }

    // Apply filters
    if (projectFilter) {
      entries = entries.filter(e => e.project?.includes(projectFilter));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter(e => e.display?.toLowerCase().includes(query));
    }

    if (startDate) {
      entries = entries.filter(e => e.timestamp >= startDate);
    }

    if (endDate) {
      entries = entries.filter(e => e.timestamp <= endDate);
    }

    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    // Paginate
    const total = entries.length;
    const paginatedEntries = entries.slice(offset, offset + limit);

    res.json({
      data: paginatedEntries,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  } catch {
    res.json({
      data: [],
      meta: {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false
      }
    });
  }
});

export { router as historyRouter };
