import { Router, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

function getClaudeConfigPath(): string {
  return join(homedir(), '.claude.json');
}

// Sensitive fields to redact from config
const SENSITIVE_FIELDS = [
  'oauthAccount',
  'accessToken',
  'refreshToken',
  'apiKey',
  'credentials',
  'token',
  'secret'
];

function redactSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key is sensitive
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      key.toLowerCase().includes(field.toLowerCase())
    );

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveData(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// GET /config - Get Claude configuration
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configPath = getClaudeConfigPath();
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Redact sensitive data
    const safeConfig = redactSensitiveData(config);

    res.json(safeConfig);
  } catch {
    res.json({});
  }
});

// GET /config/settings - Get user settings
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const claudeDir = getClaudeDir();
    const settingsPath = join(claudeDir, 'settings.json');
    const content = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    res.json(settings);
  } catch {
    res.json({});
  }
});

export { router as configRouter };
