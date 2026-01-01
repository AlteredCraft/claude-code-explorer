import { getSession, getSessionMessages } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SourcePath } from '@/components/source-path';
import { SessionTabs } from '@/components/session-tabs';
import Link from 'next/link';

function decodeFromUrl(str: string): string {
  return decodeURIComponent(str);
}

function decodeProjectPath(encoded: string): string {
  if (encoded.startsWith('-')) {
    return '/' + encoded.slice(1).replace(/-/g, '/');
  }
  return encoded.replace(/-/g, '/');
}

function getProjectName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

interface PageProps {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { id, sessionId } = await params;
  const projectId = decodeFromUrl(id);
  const decodedPath = decodeProjectPath(projectId);
  const projectName = getProjectName(decodedPath);

  const [sessionDetail, messagesResponse] = await Promise.all([
    getSession(projectId, sessionId),
    getSessionMessages(projectId, sessionId, { limit: 100 }),
  ]);

  const messages = messagesResponse.data;

  // Filter to just user and assistant messages for the conversation view
  const conversationMessages = messages.filter(
    m => m.type === 'user' || m.type === 'assistant'
  );

  const startTime = new Date(sessionDetail.startTime);
  const endTime = sessionDetail.endTime ? new Date(sessionDetail.endTime) : undefined;
  const duration = endTime ? endTime.getTime() - startTime.getTime() : (sessionDetail.duration || 0);

  const metadata = sessionDetail.metadata;
  const correlatedData = sessionDetail.correlatedData;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Projects
        </Link>
        <span>/</span>
        <Link
          href={`/projects/${id}`}
          className="hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {projectName}
        </Link>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-100 font-mono">
          {sessionId.slice(0, 8)}...
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
            {sessionId}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            {startTime.toLocaleString()}
          </p>
          <SourcePath path={`~/.claude/projects/${projectId}/${sessionId}.jsonl`} className="mt-1" />
        </div>
        {metadata.model && (
          <Badge variant="outline">{metadata.model.replace('claude-', '').replace(/-\d+$/, '')}</Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{conversationMessages.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatDuration(duration)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tools Used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{metadata.toolsUsed.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Correlated Data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {(correlatedData.todos.length > 0 ? 1 : 0) +
                (correlatedData.fileHistory.length > 0 ? 1 : 0) +
                (correlatedData.debugLogs.length > 0 ? 1 : 0) +
                (correlatedData.linkedPlan ? 1 : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Client Component for interactive tabs */}
      <SessionTabs
        messages={messages}
        metadata={metadata}
        correlatedData={correlatedData}
        sessionId={sessionId}
      />
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
