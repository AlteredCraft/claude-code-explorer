import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getClaudeDir } from './path-utils';
import type { CorrelatedData, TodoItem, FileBackup, FileChange, FilesChangedResponse } from './types';

/**
 * Find all data correlated with a session ID
 */
export async function correlateSessionData(sessionId: string): Promise<CorrelatedData> {
  const [todos, filesChanged, debugLogs, linkedPlan, linkedSkill] = await Promise.all([
    findSessionTodos(sessionId),
    findSessionFilesChanged(sessionId),
    findSessionDebugLogs(sessionId),
    findLinkedPlan(sessionId),
    findLinkedSkill(sessionId),
  ]);

  return {
    todos,
    filesChanged,
    debugLogs,
    linkedPlan,
    linkedSkill,
  };
}

/**
 * Find todo items associated with a session
 * Todos are stored in ~/.claude/todos/[session-uuid]-agent-[agent-uuid].json
 */
async function findSessionTodos(sessionId: string): Promise<TodoItem[]> {
  const claudeDir = getClaudeDir();
  const todosDir = join(claudeDir, 'todos');

  try {
    const entries = await readdir(todosDir, { withFileTypes: true });

    // Find files or directories matching this session ID
    const matching = entries.filter(e => e.name.startsWith(sessionId));

    const todos: TodoItem[] = [];

    for (const entry of matching) {
      const entryPath = join(todosDir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.json')) {
        // Direct JSON file
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
        // Directory containing todo files
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

/**
 * Find files changed during a session
 * File history backup files are stored in ~/.claude/file-history/[session-uuid]/
 * Format: {fileHash}@v{version}
 *
 * Note: This is a simplified implementation that only reads from the backup directory.
 * The full implementation should parse session transcripts for file-history-snapshot messages.
 */
async function findSessionFilesChanged(sessionId: string): Promise<FilesChangedResponse | null> {
  const claudeDir = getClaudeDir();
  const fileHistoryDir = join(claudeDir, 'file-history', sessionId);

  try {
    const files = await readdir(fileHistoryDir);

    // Group by hash to identify unique files
    const filesByHash: Map<string, FileBackup[]> = new Map();

    for (const file of files) {
      // Backup files have format: {hash}@v{version}
      const match = file.match(/^(.+)@v(\d+)$/);
      if (match) {
        const hash = match[1];
        const version = parseInt(match[2], 10);

        if (!filesByHash.has(hash)) {
          filesByHash.set(hash, []);
        }
        filesByHash.get(hash)!.push({
          backupFileName: file,
          version,
        });
      }
    }

    if (filesByHash.size === 0) {
      return null;
    }

    // Convert to FileChange array
    // Note: Without parsing session transcripts, we can't determine the actual file paths
    // or whether files were created vs modified
    const fileChanges: FileChange[] = [];

    for (const [hash, backups] of filesByHash) {
      backups.sort((a, b) => a.version - b.version);
      fileChanges.push({
        path: `(backup ${hash})`,
        action: 'modified', // Can't determine without transcript parsing
        backups,
      });
    }

    return {
      sessionId,
      summary: {
        created: 0,
        modified: fileChanges.length,
        totalFiles: fileChanges.length,
      },
      files: fileChanges,
    };
  } catch {
    return null;
  }
}

/**
 * Find debug logs for a session
 * Debug logs are stored in ~/.claude/debug/[uuid].txt
 */
async function findSessionDebugLogs(sessionId: string): Promise<string[]> {
  const claudeDir = getClaudeDir();
  const debugDir = join(claudeDir, 'debug');

  try {
    const files = await readdir(debugDir);

    // Look for files that might match this session
    const matching = files.filter(f =>
      f.includes(sessionId) || f.startsWith(sessionId.slice(0, 8))
    );

    const logs: string[] = [];

    for (const file of matching.slice(0, 5)) {
      // Limit to 5 files
      try {
        const content = await readFile(join(debugDir, file), 'utf-8');
        logs.push(`=== ${file} ===\n${content.slice(0, 5000)}`); // Limit content size
      } catch {
        // Skip unreadable files
      }
    }

    return logs;
  } catch {
    return [];
  }
}

/**
 * Find a linked plan for a session
 * TODO: Investigate how plans correlate with sessions
 * Plans are in ~/.claude/plans/ with names like 'magical-nibbling-metcalfe.md'
 */
async function findLinkedPlan(sessionId: string): Promise<string | undefined> {
  const claudeDir = getClaudeDir();
  const plansDir = join(claudeDir, 'plans');

  try {
    const files = await readdir(plansDir);
    const planFiles = files.filter(f => f.endsWith('.md'));

    // For now, check if any plan file content mentions the session ID
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

/**
 * Find a linked skill for a session
 * TODO: Detect skill usage from session messages
 */
async function findLinkedSkill(sessionId: string): Promise<string | undefined> {
  // This would need to analyze session messages for skill invocations
  // For now, return undefined
  return undefined;
}

/**
 * Get all available plans
 */
export async function getAllPlans(): Promise<string[]> {
  const claudeDir = getClaudeDir();
  const plansDir = join(claudeDir, 'plans');

  try {
    const files = await readdir(plansDir);
    return files.filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Get all available skills
 */
export async function getAllSkills(): Promise<string[]> {
  const claudeDir = getClaudeDir();
  const skillsDir = join(claudeDir, 'skills');

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
