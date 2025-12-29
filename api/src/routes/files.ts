import { Router, Request, Response } from 'express';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, normalize } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

// GET /files - Browse ~/.claude/ directory
router.get('/', async (req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const relativePath = (req.query.path as string) || '';

    // Security: normalize and validate path is within ~/.claude/
    const requestedPath = normalize(join(claudeDir, relativePath));
    const normalizedClaudeDir = normalize(claudeDir);

    if (!requestedPath.startsWith(normalizedClaudeDir)) {
      return res.status(400).json({
        code: 'INVALID_PATH',
        message: 'Path must be within ~/.claude/'
      });
    }

    try {
      const fileStat = await stat(requestedPath);

      if (fileStat.isDirectory()) {
        // List directory contents
        const entries = await readdir(requestedPath, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory()
        }));

        res.json({
          type: 'directory',
          path: requestedPath,
          entries: items
        });
      } else if (fileStat.isFile()) {
        // Return file content (limit to 100KB)
        if (fileStat.size > 100 * 1024) {
          return res.json({
            type: 'file',
            path: requestedPath,
            error: 'File too large (max 100KB)'
          });
        }

        const content = await readFile(requestedPath, 'utf-8');
        res.json({
          type: 'file',
          path: requestedPath,
          content
        });
      } else {
        res.status(400).json({
          code: 'INVALID_TYPE',
          message: 'Path is not a file or directory'
        });
      }
    } catch {
      res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Path not found'
      });
    }
  } catch (error) {
    console.error('Error browsing files:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to browse files'
    });
  }
});

export { router as filesRouter };
