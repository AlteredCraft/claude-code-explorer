import { getProjectSessions } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SourcePath } from '@/components/source-path';
import Link from 'next/link';
import { ActivityTimeline } from '@/components/activity-timeline';

function decodeFromUrl(str: string): string {
  return decodeURIComponent(str);
}

function decodeProjectPath(encoded: string): string {
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

function getDisplayPath(path: string): string {
  // Approximate home detection
  if (path.startsWith('/Users/') || path.startsWith('/home/')) {
    const parts = path.split('/');
    if (parts.length >= 3) {
      return '~/' + parts.slice(3).join('/');
    }
  }
  return path;
}

function getProjectName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;
  const projectId = decodeFromUrl(id);
  const decodedPath = decodeProjectPath(projectId);
  const projectName = getProjectName(decodedPath);
  const displayPath = getDisplayPath(decodedPath);

  const response = await getProjectSessions(projectId);
  const sessions = response.data;

  // Separate regular sessions from sub-agent sessions
  const regularSessions = sessions.filter(s => !s.isSubAgent);
  const agentSessions = sessions.filter(s => s.isSubAgent);

  // Convert string dates to Date objects for the ActivityTimeline component
  const sessionsForTimeline = regularSessions.map(s => ({
    ...s,
    startTime: new Date(s.startTime),
    endTime: s.endTime ? new Date(s.endTime) : undefined,
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Projects
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-100">{projectName}</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{projectName}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 font-mono">{displayPath}</p>
        <SourcePath path={`~/.claude/projects/${projectId}/`} className="mt-1" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{regularSessions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Agent Sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{agentSessions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {sessions.reduce((sum, s) => sum + s.messageCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Timeline</CardTitle>
          <CardDescription>
            Click on a session to view details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTimeline
            sessions={sessionsForTimeline}
            projectId={id}
          />
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>
            {regularSessions.length} main sessions, {agentSessions.length} agent sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {regularSessions.map((session) => (
              <Link
                key={session.id}
                href={`/projects/${id}/sessions/${session.id}`}
                className="block p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
                      {session.id.slice(0, 8)}...
                    </div>
                    {session.model && (
                      <Badge variant="outline" className="text-xs">
                        {session.model.replace('claude-', '').replace(/-\d+$/, '')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <span>{session.messageCount} messages</span>
                    <span>{formatSessionTime(session.startTime)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {agentSessions.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Agent Sessions
              </h4>
              <div className="space-y-2">
                {agentSessions.slice(0, 10).map((session) => (
                  <Link
                    key={session.id}
                    href={`/projects/${id}/sessions/${session.id}`}
                    className="block p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-mono text-zinc-600 dark:text-zinc-400">
                        {session.id}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {session.messageCount} messages
                      </div>
                    </div>
                  </Link>
                ))}
                {agentSessions.length > 10 && (
                  <div className="text-xs text-zinc-500 text-center py-2">
                    +{agentSessions.length - 10} more agent sessions
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatSessionTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
