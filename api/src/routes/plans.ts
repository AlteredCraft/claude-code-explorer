import { Router, Request, Response } from 'express';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

// GET /plans - List all plans
router.get('/', async (_req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const plansDir = join(claudeDir, 'plans');

    const files = await readdir(plansDir);
    const planFiles = files.filter(f => f.endsWith('.md'));

    res.json({ data: planFiles });
  } catch {
    res.json({ data: [] });
  }
});

// GET /plans/:planName - Get plan content
router.get('/:planName', async (req: Request, res: Response) => {
  try {
    const { planName } = req.params;
    const claudeDir = getClaudeDir();
    const planPath = join(claudeDir, 'plans', planName);

    // Security: ensure path doesn't escape plans directory
    const normalizedPath = join(claudeDir, 'plans', planName);
    if (!normalizedPath.startsWith(join(claudeDir, 'plans'))) {
      return res.status(400).json({
        code: 'INVALID_PATH',
        message: 'Invalid plan path'
      });
    }

    const content = await readFile(planPath, 'utf-8');

    res.json({
      name: planName,
      content
    });
  } catch {
    res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Plan not found'
    });
  }
});

export { router as plansRouter };
