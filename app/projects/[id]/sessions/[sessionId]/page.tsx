import { getSessionMessages, getSessionMetadata } from '@/lib/claude-data';
import { correlateSessionData } from '@/lib/session-correlator';
import { decodeFromUrl, decodeProjectPath, getProjectName } from '@/lib/path-utils';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SourcePath } from '@/components/source-path';
import { SessionTabs } from '@/components/session-tabs';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string; sessionId: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { id, sessionId } = await params;
  const encodedPath = decodeFromUrl(id);
  const decodedPath = decodeProjectPath(encodedPath);
  const projectName = getProjectName(decodedPath);

  const [messages, metadata, correlatedData] = await Promise.all([
    getSessionMessages(encodedPath, sessionId),
    getSessionMetadata(encodedPath, sessionId),
    correlateSessionData(sessionId),
  ]);

  // Filter to just user and assistant messages for the conversation view
  const conversationMessages = messages.filter(
    m => m.type === 'user' || m.type === 'assistant'
  );

  const startTime = messages.length > 0 ? messages[0].timestamp : new Date();
  const endTime = messages.length > 0 ? messages[messages.length - 1].timestamp : undefined;
  const duration = endTime ? endTime.getTime() - startTime.getTime() : 0;

  // Serialize data for client component
  const serializedMessages = messages.map(m => ({
    ...m,
    timestamp: m.timestamp.toISOString(),
  }));

  const serializedCorrelatedData = {
    ...correlatedData,
    fileHistory: correlatedData.fileHistory.map(f => ({
      ...f,
      timestamp: f.timestamp.toISOString(),
    })),
  };

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
          <SourcePath path={`~/.claude/projects/${encodedPath}/${sessionId}.jsonl`} className="mt-1" />
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
        messages={serializedMessages}
        metadata={metadata}
        correlatedData={serializedCorrelatedData}
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
