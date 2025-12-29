import { getProjects, getProjectDisplayInfo } from '@/lib/claude-data';
import { encodeForUrl } from '@/lib/path-utils';
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
import Link from 'next/link';

function formatRelativeTime(date: Date | undefined): string {
  if (!date) return 'Never';

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

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '-';
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined) return '-';
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

export default async function HomePage() {
  const projects = await getProjects();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Projects</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
          {projects.length} projects found
        </p>
        <div className="flex items-center gap-2 mt-1">
          <SourcePath path="~/.claude.json" />
          <span className="text-xs text-zinc-400">,</span>
          <SourcePath path="~/.claude/projects/" />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Projects</CardTitle>
          <CardDescription>
            Click a project to view its session timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Project</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-right">Last Cost</TableHead>
                <TableHead className="text-right">Tokens (In/Out)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const info = getProjectDisplayInfo(project);
                return (
                  <TableRow key={project.encodedPath} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <TableCell>
                      <Link
                        href={`/projects/${encodeForUrl(project.encodedPath)}`}
                        className="block"
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {info.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                          {info.displayPath}
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
