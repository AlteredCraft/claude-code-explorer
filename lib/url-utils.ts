// URL and path utility functions

/**
 * Decode a URL-encoded string
 */
export function decodeFromUrl(str: string): string {
  return decodeURIComponent(str);
}

/**
 * Decode a Claude Code project path from its encoded form.
 * Claude Code encodes paths by replacing all non-alphanumeric chars with '-'
 * This is a lossy operation, so we approximate the original path.
 */
export function decodeProjectPath(encoded: string): string {
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

/**
 * Get the project name (last segment) from a path
 */
export function getProjectName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Convert an absolute path to a display-friendly path with ~ for home
 */
export function getDisplayPath(path: string): string {
  // Approximate home detection
  if (path.startsWith('/Users/') || path.startsWith('/home/')) {
    const parts = path.split('/');
    if (parts.length >= 3) {
      return '~/' + parts.slice(3).join('/');
    }
  }
  return path;
}
