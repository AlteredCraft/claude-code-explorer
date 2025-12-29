'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

interface Session {
  id: string;
  startTime: Date;
  endTime?: Date;
  messageCount: number;
  model?: string;
}

interface ActivityTimelineProps {
  sessions: Session[];
  projectId: string;
}

export function ActivityTimeline({ sessions, projectId }: ActivityTimelineProps) {
  const router = useRouter();

  // Group sessions by day
  const sessionsByDay = useMemo(() => {
    const groups = new Map<string, Session[]>();

    for (const session of sessions) {
      const date = new Date(session.startTime);
      const dateKey = date.toISOString().split('T')[0];

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    }

    // Sort by date descending
    const sorted = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    return sorted.slice(0, 14); // Last 14 days
  }, [sessions]);

  // Find max messages for scaling
  const maxMessages = useMemo(() => {
    return Math.max(...sessions.map(s => s.messageCount), 1);
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No sessions found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline visualization */}
      <div className="flex items-end gap-1 h-32 px-2">
        {sessionsByDay.map(([dateKey, daySessions]) => {
          const totalMessages = daySessions.reduce((sum, s) => sum + s.messageCount, 0);
          const height = Math.max(8, (totalMessages / maxMessages) * 100);
          const date = new Date(dateKey);

          return (
            <div
              key={dateKey}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div
                className="w-full bg-blue-500 dark:bg-blue-600 rounded-t cursor-pointer hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
                style={{ height: `${height}%` }}
                onClick={() => {
                  // Navigate to first session of the day
                  if (daySessions.length > 0) {
                    router.push(`/projects/${projectId}/sessions/${daySessions[0].id}`);
                  }
                }}
                title={`${date.toLocaleDateString()}: ${daySessions.length} sessions, ${totalMessages} messages`}
              />
              <span className="text-[10px] text-zinc-500 rotate-0">
                {date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-2">
        <span>Older</span>
        <span>Bar height = message volume</span>
        <span>Recent</span>
      </div>

      {/* Daily breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-4">
        {sessionsByDay.slice(0, 7).map(([dateKey, daySessions]) => {
          const date = new Date(dateKey);
          const isToday = dateKey === new Date().toISOString().split('T')[0];

          return (
            <div
              key={dateKey}
              className={`p-2 rounded-lg border ${
                isToday
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {isToday ? 'Today' : date.toLocaleDateString([], { weekday: 'short' })}
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {daySessions.length}
              </div>
              <div className="text-xs text-zinc-500">
                {daySessions.reduce((sum, s) => sum + s.messageCount, 0)} msgs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
