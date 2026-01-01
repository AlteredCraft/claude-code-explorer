'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SourcePath } from '@/components/source-path';

interface Message {
  uuid: string;
  type: string;
  timestamp: string;
  content: unknown;
}

interface SessionMetadata {
  toolsUsed: string[];
  model?: string;
}

interface FileHistoryEntry {
  filePath: string;
  backupFileName: string;
  version: number;
  backupTime?: string;
  messageId?: string;
}

interface CorrelatedData {
  todos: { content: string; status: string }[];
  fileHistory: FileHistoryEntry[];
  debugLogs: string[];
  linkedPlan?: string;
  linkedSkill?: string;
}

interface SessionTabsProps {
  messages: Message[];
  metadata: SessionMetadata;
  correlatedData: CorrelatedData;
  sessionId: string;
}

export function SessionTabs({ messages, metadata, correlatedData, sessionId }: SessionTabsProps) {
  const [visibleCount, setVisibleCount] = useState(50);

  const conversationMessages = messages.filter(
    (m) => m.type === 'user' || m.type === 'assistant'
  );

  const loadMore = () => {
    setVisibleCount((prev) => Math.min(prev + 50, conversationMessages.length));
  };

  return (
    <Tabs defaultValue="conversation" className="space-y-4">
      <TabsList>
        <TabsTrigger value="conversation">Conversation</TabsTrigger>
        <TabsTrigger value="tools">Tools ({metadata.toolsUsed.length})</TabsTrigger>
        <TabsTrigger value="correlated">Correlated Data</TabsTrigger>
      </TabsList>

      <TabsContent value="conversation">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversation</CardTitle>
            <CardDescription>
              {conversationMessages.length} messages in this session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {conversationMessages.slice(0, visibleCount).map((message, idx) => (
                <div
                  key={message.uuid || idx}
                  className={`p-4 rounded-lg ${
                    message.type === 'user'
                      ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
                      : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={message.type === 'user' ? 'default' : 'secondary'}>
                      {message.type}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                    <MessageContent content={message.content} />
                  </div>
                </div>
              ))}
              {visibleCount < conversationMessages.length && (
                <button
                  onClick={loadMore}
                  className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded"
                >
                  Load more ({conversationMessages.length - visibleCount} remaining)
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tools">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tools Used</CardTitle>
            <CardDescription>Tools invoked during this session</CardDescription>
          </CardHeader>
          <CardContent>
            {metadata.toolsUsed.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {metadata.toolsUsed.map((tool) => (
                  <Badge key={tool} variant="outline" className="font-mono">
                    {tool}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No tools were used in this session</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="correlated">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Correlated Data</CardTitle>
            <CardDescription>
              Data from other sources associated with this session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="multiple" className="w-full">
              {/* Todos */}
              <AccordionItem value="todos">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>Todos</span>
                    <Badge variant="secondary">{correlatedData.todos.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SourcePath path="~/.claude/todos/" className="mb-2" />
                  {correlatedData.todos.length > 0 ? (
                    <div className="space-y-2">
                      {correlatedData.todos.map((todo, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 rounded bg-zinc-50 dark:bg-zinc-900"
                        >
                          <Badge
                            variant={
                              todo.status === 'completed'
                                ? 'default'
                                : todo.status === 'in_progress'
                                ? 'secondary'
                                : 'outline'
                            }
                            className="text-xs"
                          >
                            {todo.status}
                          </Badge>
                          <span className="text-sm">{todo.content}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No todos found for this session</p>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* File History */}
              <AccordionItem value="files">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>File History</span>
                    <Badge variant="secondary">{correlatedData.fileHistory.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SourcePath path={`~/.claude/file-history/${sessionId}/`} className="mb-2" />
                  {correlatedData.fileHistory.length > 0 ? (
                    <div className="space-y-1">
                      {correlatedData.fileHistory.map((entry, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded bg-zinc-50 dark:bg-zinc-900 font-mono text-sm"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{entry.filePath}</span>
                            <span className="text-xs text-zinc-500 truncate">{entry.backupFileName}</span>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0 ml-2">
                            v{entry.version}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No file history found for this session</p>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Debug Logs */}
              <AccordionItem value="debug">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>Debug Logs</span>
                    <Badge variant="secondary">{correlatedData.debugLogs.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SourcePath path="~/.claude/debug/" className="mb-2" />
                  {correlatedData.debugLogs.length > 0 ? (
                    <div className="space-y-2">
                      {correlatedData.debugLogs.map((log, idx) => (
                        <pre
                          key={idx}
                          className="p-2 rounded bg-zinc-900 text-zinc-100 text-xs overflow-auto max-h-48"
                        >
                          {log}
                        </pre>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No debug logs found for this session</p>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Linked Plan */}
              <AccordionItem value="plan">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>Linked Plan</span>
                    {correlatedData.linkedPlan && <Badge variant="secondary">1</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SourcePath
                    path={correlatedData.linkedPlan ? `~/.claude/plans/${correlatedData.linkedPlan}` : '~/.claude/plans/'}
                    className="mb-2"
                  />
                  {correlatedData.linkedPlan ? (
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900">
                      <span className="font-mono text-sm">{correlatedData.linkedPlan}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No linked plan found for this session</p>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Linked Skill */}
              <AccordionItem value="skill">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>Linked Skill</span>
                    {correlatedData.linkedSkill && <Badge variant="secondary">1</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <SourcePath
                    path={correlatedData.linkedSkill ? `~/.claude/skills/${correlatedData.linkedSkill}/` : '~/.claude/skills/'}
                    className="mb-2"
                  />
                  {correlatedData.linkedSkill ? (
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900">
                      <span className="font-mono text-sm">{correlatedData.linkedSkill}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No linked skill found for this session</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

function MessageContent({ content }: { content: unknown }) {
  if (typeof content === 'string') {
    return <span>{content}</span>;
  }

  if (content && typeof content === 'object') {
    const c = content as { role?: string; content?: unknown };
    if (typeof c.content === 'string') {
      return <span>{c.content}</span>;
    }
    if (Array.isArray(c.content)) {
      return (
        <div className="space-y-2">
          {c.content.map((block: ContentBlock, idx: number) => {
            if (block.type === 'text') {
              return <div key={idx}>{block.text}</div>;
            }
            if (block.type === 'thinking') {
              return <ThinkingBlock key={idx} block={block} />;
            }
            if (block.type === 'tool_use') {
              return <ToolUseBlock key={idx} block={block} />;
            }
            if (block.type === 'tool_result') {
              return <ToolResultBlock key={idx} block={block} />;
            }
            return <div key={idx}>[{block.type}]</div>;
          })}
        </div>
      );
    }
  }

  return <pre className="text-xs">{JSON.stringify(content, null, 2)}</pre>;
}

function ThinkingBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const thinking = block.thinking || '';
  const preview = thinking.length > 100 ? thinking.slice(0, 100) + '...' : thinking;

  return (
    <div className="border border-purple-300 dark:border-purple-800 rounded p-2 bg-purple-50 dark:bg-purple-950">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 w-full text-left"
      >
        <span className="text-zinc-400">{expanded ? '▼' : '▶'}</span>
        <span className="text-purple-600 dark:text-purple-400 text-xs italic">thinking</span>
        {!expanded && (
          <span className="text-zinc-500 text-xs truncate flex-1 italic">{preview}</span>
        )}
      </button>
      {expanded && (
        <pre className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 p-2 rounded bg-purple-100 dark:bg-purple-900 overflow-auto max-h-96 whitespace-pre-wrap">
          {thinking}
        </pre>
      )}
    </div>
  );
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-zinc-300 dark:border-zinc-700 rounded p-2 bg-zinc-100 dark:bg-zinc-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-mono text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <span className="text-zinc-400">{expanded ? '▼' : '▶'}</span>
        <span className="font-semibold">{block.name}</span>
        <span className="text-zinc-500 text-xs">tool_use</span>
      </button>
      {expanded && block.input && (
        <pre className="mt-2 text-xs bg-zinc-900 text-zinc-100 p-2 rounded overflow-auto max-h-64">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);

  // tool_result content can be a string or array
  const resultContent = typeof block.content === 'string'
    ? block.content
    : JSON.stringify(block.content, null, 2);

  // Truncate for preview
  const preview = resultContent.length > 100
    ? resultContent.slice(0, 100) + '...'
    : resultContent;

  return (
    <div className="border border-green-300 dark:border-green-800 rounded p-2 bg-green-50 dark:bg-green-950">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-mono text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 w-full text-left"
      >
        <span className="text-zinc-400">{expanded ? '▼' : '▶'}</span>
        <span className="text-green-600 dark:text-green-400 text-xs">tool_result</span>
        {!expanded && (
          <span className="text-zinc-500 text-xs truncate flex-1">{preview}</span>
        )}
      </button>
      {expanded && (
        <pre className="mt-2 text-xs bg-zinc-900 text-zinc-100 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap">
          {resultContent}
        </pre>
      )}
    </div>
  );
}
