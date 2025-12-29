'use server';

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface FileContent {
  type: 'file' | 'directory';
  path: string;
  content?: string;
  entries?: { name: string; isDirectory: boolean }[];
  error?: string;
}

/**
 * Read file or directory content from ~/.claude/
 * Only allows reading from ~/.claude/ for security
 */
export async function readClaudeFile(relativePath: string): Promise<FileContent> {
  // Normalize path - handle ~/ prefix
  const normalizedPath = relativePath.startsWith('~/')
    ? relativePath.slice(2)
    : relativePath;

  // Security: only allow reading from .claude directory or .claude.json
  if (!normalizedPath.startsWith('.claude') && normalizedPath !== '.claude.json') {
    return {
      type: 'file',
      path: relativePath,
      error: 'Access denied: can only read from ~/.claude/',
    };
  }

  const fullPath = join(homedir(), normalizedPath);

  try {
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      const entries = await readdir(fullPath, { withFileTypes: true });
      return {
        type: 'directory',
        path: relativePath,
        entries: entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
        })).sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        }),
      };
    } else {
      const content = await readFile(fullPath, 'utf-8');
      // Limit content size for display
      const truncated = content.length > 100000
        ? content.slice(0, 100000) + '\n\n... (truncated, file too large)'
        : content;
      return {
        type: 'file',
        path: relativePath,
        content: truncated,
      };
    }
  } catch (error) {
    return {
      type: 'file',
      path: relativePath,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
}
