export const dynamic = 'force-dynamic'; // Disable static pre-rendering

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getProjects, type AppSettings } from '@/lib/api-client';

async function getServerAppSettings(): Promise<AppSettings> {
  try {
    const configPath = join(process.cwd(), '.config', 'app.json');
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as AppSettings;
  } catch {
    return { pathPrefix: [] };
  }
}
import { SourcePath } from '@/components/source-path';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectConfigModal } from '@/components/project-config-modal';
import { ColumnInfoModal } from '@/components/column-info-modal';
import Link from 'next/link';

function encodeForUrl(str: string): string {
  return encodeURIComponent(str);
}

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatCost(cost: number | undefined | null): string {
  if (cost === undefined || cost === null) return '-';
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number | undefined | null): string {
  if (tokens === undefined || tokens === null) return '-';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

export default async function HomePage() {
  const settings = await getServerAppSettings();
  const response = await getProjects({
    pathPrefix: settings.pathPrefix.length > 0 ? settings.pathPrefix : undefined,
  });
  const projects = response.data;
  const hasActiveFilters = settings.pathPrefix.length > 0;

  // Split into projects with sessions and config-only projects
  const projectsWithSessions = projects.filter(p => p.hasSessionData);
  const configOnlyProjects = projects.filter(p => !p.hasSessionData);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Projects</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          {projectsWithSessions.length} projects with sessions, {configOnlyProjects.length} initialized only
          {hasActiveFilters && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
              (filtered: {settings.pathPrefix.join(', ')})
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <SourcePath path="~/.claude.json" />
          <span className="text-xs text-zinc-400">,</span>
          <SourcePath path="~/.claude/projects/" />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Projects</CardTitle>
          <CardDescription>
            Click a project to view its session timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">
                  Project
                  <ColumnInfoModal title="Project">
                    <p>The project name and path are derived from the directory structure in <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude/projects/</code>.</p>
                    <p>Directory names are encoded (e.g., <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">-Users-sam-Projects-foo</code>) and decoded back to real paths using the config lookup from <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude.json</code>.</p>
                    <p>Projects marked &quot;(inferred)&quot; are orphans where the path was extracted from session file metadata.</p>
                  </ColumnInfoModal>
                </TableHead>
                <TableHead>
                  Sessions
                  <ColumnInfoModal title="Sessions">
                    <p>Count of <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">.jsonl</code> session files in the project directory.</p>
                    <p>Each session file contains the conversation transcript for one Claude Code session, including user messages, assistant responses, and tool calls.</p>
                    <p>Files prefixed with <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">agent-</code> are sub-agent sessions spawned during a parent session.</p>
                  </ColumnInfoModal>
                </TableHead>
                <TableHead>
                  Last Activity
                  <ColumnInfoModal title="Last Activity">
                    <p>The file modification time of the most recent session file in the project directory.</p>
                    <p>This reflects when the last message was written to any session, giving a sense of when you last worked on this project with Claude.</p>
                  </ColumnInfoModal>
                </TableHead>
                <TableHead className="text-right">
                  Last Cost
                  <ColumnInfoModal title="Last Cost">
                    <p>The <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">lastCost</code> field from the project entry in <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude.json</code>.</p>
                    <p>This represents the API cost of the most recent session, calculated from token usage and model pricing.</p>
                    <p>Note: This is only the last session&apos;s cost, not cumulative project cost.</p>
                  </ColumnInfoModal>
                </TableHead>
                <TableHead className="text-right">
                  Tokens (In/Out)
                  <ColumnInfoModal title="Tokens (In/Out)">
                    <p>Token counts from <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">lastTotalInputTokens</code> and <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">lastTotalOutputTokens</code> in <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude.json</code>.</p>
                    <p><strong>Input tokens:</strong> Your prompts, file contents, and context sent to Claude.</p>
                    <p><strong>Output tokens:</strong> Claude&apos;s responses, code, and tool calls.</p>
                    <p>These are from the last session only, displayed as K (thousands) or M (millions).</p>
                  </ColumnInfoModal>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsWithSessions.map((project) => {
                return (
                  <TableRow key={project.encodedPath} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <TableCell>
                      <Link
                        href={`/projects/${encodeForUrl(project.encodedPath)}`}
                        className="block"
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {project.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                          {project.displayPath}
                          {project.isOrphan && (
                            <span
                              className="ml-1 text-zinc-400 dark:text-zinc-600"
                              title="Path inferred from session data (not in config)"
                            >
                              (inferred)
                            </span>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${encodeForUrl(project.encodedPath)}`}>
                        <Badge variant="secondary">{project.sessionCount}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/projects/${encodeForUrl(project.encodedPath)}`}>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          {formatRelativeTime(project.lastActivity)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/projects/${encodeForUrl(project.encodedPath)}`}>
                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
                          {formatCost(project.lastCost)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/projects/${encodeForUrl(project.encodedPath)}`}>
                        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
                          {formatTokens(project.lastTotalInputTokens)} / {formatTokens(project.lastTotalOutputTokens)}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {!project.isOrphan && (
                        <ProjectConfigModal
                          encodedPath={project.encodedPath}
                          projectName={project.name}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {configOnlyProjects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Other Projects</CardTitle>
            <CardDescription>
              Initialized but no session data recorded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">
                    Project
                    <ColumnInfoModal title="Project">
                      <p>These projects exist in <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude.json</code> but have no session files in <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude/projects/</code>.</p>
                      <p>This typically means the project was initialized (Claude Code was run there) but no conversation was saved.</p>
                    </ColumnInfoModal>
                  </TableHead>
                  <TableHead>
                    Status
                    <ColumnInfoModal title="Status">
                      <p>Indicates whether session files exist for this project.</p>
                      <p>&quot;No sessions&quot; means the project directory either doesn&apos;t exist or contains no <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">.jsonl</code> files.</p>
                    </ColumnInfoModal>
                  </TableHead>
                  <TableHead className="text-right">
                    Last Cost
                    <ColumnInfoModal title="Last Cost">
                      <p>The <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">lastCost</code> field from <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">~/.claude.json</code>.</p>
                      <p>Even without session files, Claude Code may have recorded the cost of past interactions in the config.</p>
                    </ColumnInfoModal>
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configOnlyProjects.map((project) => (
                  <TableRow key={project.encodedPath} className="opacity-60">
                    <TableCell>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {project.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                        {project.displayPath}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-zinc-500">No sessions</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
                        {formatCost(project.lastCost)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ProjectConfigModal
                        encodedPath={project.encodedPath}
                        projectName={project.name}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
