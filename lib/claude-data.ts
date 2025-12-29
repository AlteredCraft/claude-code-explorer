import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import {
  getClaudeDir,
  getClaudeConfigPath,
  decodeProjectPath,
  buildPathLookup,
  getDisplayPath,
  getProjectName
} from './path-utils';
import type {
  Project,
  Session,
  Message,
  ProjectConfig,
  SessionMetadata
} from './types';

/**
 * Get all projects from ~/.claude/projects/
 */
export async function getProjects(): Promise<Project[]> {
  const claudeDir = getClaudeDir();
  const projectsDir = join(claudeDir, 'projects');

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const projectDirs = entries.filter(e => e.isDirectory());

    // Load config to get project metadata and build path lookup
    const config = await getClaudeConfig();
    const pathLookup = buildPathLookup(config);

    const projects: Project[] = await Promise.all(
      projectDirs.map(async (dir) => {
        // Use lookup for accurate path, fall back to decode for orphaned directories
        const decodedPath = pathLookup.get(dir.name) ?? decodeProjectPath(dir.name);
        const configProjects = config.projects as Record<string, ProjectConfig> | undefined;
        const projectConfig = configProjects?.[decodedPath];
        const sessionFiles = await getSessionFiles(dir.name);

        // Get last activity from most recent session file
        let lastActivity: Date | undefined;
        if (sessionFiles.length > 0) {
          const latestFile = sessionFiles[0]; // Already sorted by mtime desc
          lastActivity = latestFile.mtime;
        }

        return {
          path: decodedPath,
          encodedPath: dir.name,
          lastSessionId: projectConfig?.lastSessionId,
          lastCost: projectConfig?.lastCost,
          lastDuration: projectConfig?.lastDuration,
          lastTotalInputTokens: projectConfig?.lastTotalInputTokens,
          lastTotalOutputTokens: projectConfig?.lastTotalOutputTokens,
          sessionCount: sessionFiles.length,
          lastActivity,
        };
      })
    );

    // Sort by last activity, most recent first
    return projects.sort((a, b) => {
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });
  } catch (error) {
    console.error('Error reading projects:', error);
    return [];
  }
}

/**
 * Get session files for a project, sorted by modification time (newest first)
 */
async function getSessionFiles(encodedProjectPath: string): Promise<{ name: string; mtime: Date }[]> {
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

/**
 * Get sessions for a project
 */
export async function getProjectSessions(encodedProjectPath: string): Promise<Session[]> {
  const decodedPath = decodeProjectPath(encodedProjectPath);
  const sessionFiles = await getSessionFiles(encodedProjectPath);

  const sessions: Session[] = await Promise.all(
    sessionFiles.map(async (file) => {
      const sessionId = file.name.replace('.jsonl', '');
      const isAgent = sessionId.startsWith('agent-');

      // Read first and last lines to get time bounds and message count
      const { startTime, endTime, messageCount, model } = await getSessionBounds(
        encodedProjectPath,
        file.name
      );

      return {
        id: sessionId,
        projectPath: decodedPath,
        startTime,
        endTime,
        messageCount,
        model,
        isAgent,
      };
    })
  );

  return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

/**
 * Get session time bounds and message count by reading the JSONL file
 */
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

        // Skip file-history-snapshot entries for message count
        if (parsed.type === 'file-history-snapshot') continue;

        messageCount++;

        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : null;

        if (i === 0 && timestamp) {
          startTime = timestamp;
        }
        if (timestamp) {
          endTime = timestamp;
        }

        // Get model from assistant messages
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

/**
 * Get all messages for a session
 */
export async function getSessionMessages(
  encodedProjectPath: string,
  sessionId: string
): Promise<Message[]> {
  const claudeDir = getClaudeDir();
  const filename = sessionId.endsWith('.jsonl') ? sessionId : `${sessionId}.jsonl`;
  const filePath = join(claudeDir, 'projects', encodedProjectPath, filename);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    const messages: Message[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        // Skip non-message entries
        if (!parsed.type || parsed.type === 'file-history-snapshot') continue;

        // Skip messages without valid timestamps
        if (!parsed.timestamp) continue;
        const timestamp = new Date(parsed.timestamp);
        if (isNaN(timestamp.getTime())) continue;

        messages.push({
          uuid: parsed.uuid || parsed.messageId,
          parentUuid: parsed.parentUuid || null,
          type: parsed.type,
          timestamp,
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
  } catch (error) {
    console.error('Error reading session messages:', error);
    return [];
  }
}

/**
 * Get session metadata (tokens, cost, tools used)
 */
export async function getSessionMetadata(
  encodedProjectPath: string,
  sessionId: string
): Promise<SessionMetadata> {
  const messages = await getSessionMessages(encodedProjectPath, sessionId);

  const toolsUsed = new Set<string>();
  let model: string | undefined;

  for (const msg of messages) {
    if (msg.model) model = msg.model;

    // Extract tool names from assistant messages
    if (msg.type === 'assistant' && Array.isArray(msg.content.content)) {
      for (const block of msg.content.content) {
        if (block.type === 'tool_use' && block.name) {
          toolsUsed.add(block.name);
        }
      }
    }
  }

  return {
    totalTokens: 0, // Would need to calculate from messages
    model,
    toolsUsed: Array.from(toolsUsed),
  };
}

/**
 * Load the main Claude config file (~/.claude.json)
 */
export async function getClaudeConfig(): Promise<Record<string, unknown>> {
  const configPath = getClaudeConfigPath();

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Get project display info
 */
export function getProjectDisplayInfo(project: Project) {
  return {
    name: getProjectName(project.path),
    displayPath: getDisplayPath(project.path),
    ...project,
  };
}
