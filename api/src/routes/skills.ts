import { Router, Request, Response } from 'express';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

// GET /skills - List all skills
router.get('/', async (_req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const skillsDir = join(claudeDir, 'skills');

    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills = entries.filter(e => e.isDirectory()).map(e => e.name);

    res.json({ data: skills });
  } catch {
    res.json({ data: [] });
  }
});

export { router as skillsRouter };
