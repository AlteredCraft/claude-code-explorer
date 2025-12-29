import { homedir } from 'os';
import { join } from 'path';

/**
 * Get the Claude config directory path
 */
export function getClaudeDir(): string {
  return join(homedir(), '.claude');
}

/**
 * Get the Claude config file path
 */
export function getClaudeConfigPath(): string {
  return join(homedir(), '.claude.json');
}

/**
 * Encode a file path to the format used in ~/.claude/projects/
 * e.g., /Users/sam/Projects/foo -> -Users-sam-Projects-foo
 */
export function encodeProjectPath(path: string): string {
  return path.replace(/\//g, '-');
}

/**
 * Decode a project directory name back to the original path
 * e.g., -Users-sam-Projects-foo -> /Users/sam/Projects/foo
 */
export function decodeProjectPath(encoded: string): string {
  // Handle the leading dash which represents the root /
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

/**
 * Get a display-friendly version of a project path
 * e.g., /Users/sam/Projects/foo -> ~/Projects/foo
 */
export function getDisplayPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * Extract project name from path
 * e.g., /Users/sam/Projects/foo -> foo
 */
export function getProjectName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Build a lookup map from encoded project paths to real paths
 * using ~/.claude.json as the source of truth
 */
export function buildPathLookup(config: Record<string, unknown>): Map<string, string> {
  const lookup = new Map<string, string>();
  const projects = config.projects as Record<string, unknown> | undefined;
  if (projects) {
    for (const realPath of Object.keys(projects)) {
      const encoded = encodeProjectPath(realPath);
      lookup.set(encoded, realPath);
    }
  }
  return lookup;
}

/**
 * URL-safe encode for route params
 */
export function encodeForUrl(str: string): string {
  return encodeURIComponent(str);
}

/**
 * Decode URL-safe string
 */
export function decodeFromUrl(str: string): string {
  return decodeURIComponent(str);
}
