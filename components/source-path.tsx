'use client';

import { useState, useCallback } from 'react';
import { readClaudeFile, type FileContent } from '@/lib/actions';

interface SourcePathProps {
  path: string;
  className?: string;
}

export function SourcePath({ path, className = '' }: SourcePathProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState(path);

  const loadContent = useCallback(async (pathToLoad: string) => {
    setLoading(true);
    setCurrentPath(pathToLoad);
    try {
      const result = await readClaudeFile(pathToLoad);
      setContent(result);
    } catch {
      setContent({
        type: 'file',
        path: pathToLoad,
        error: 'Failed to load content',
      });
    }
    setLoading(false);
  }, []);

  const handleClick = async () => {
    setIsOpen(true);
    await loadContent(path);
  };

  const handleNavigate = async (entry: { name: string; isDirectory: boolean }) => {
    const newPath = currentPath.endsWith('/')
      ? `${currentPath}${entry.name}`
      : `${currentPath}/${entry.name}`;
    await loadContent(entry.isDirectory ? `${newPath}/` : newPath);
  };

  const handleBack = async () => {
    const parts = currentPath.replace(/\/$/, '').split('/');
    parts.pop();
    const parentPath = parts.join('/') + '/';
    if (parentPath.startsWith('~/.claude')) {
      await loadContent(parentPath);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`text-xs text-zinc-500 dark:text-zinc-500 font-mono hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline cursor-pointer text-left ${className}`}
      >
        {path}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                {currentPath !== path && (
                  <button
                    onClick={handleBack}
                    className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0"
                  >
                    &larr; Back
                  </button>
                )}
                <h2 className="text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate">
                  {currentPath}
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xl leading-none shrink-0 ml-4"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="text-center text-zinc-500 py-8">Loading...</div>
              ) : content?.error ? (
                <div className="text-center text-red-500 py-8">{content.error}</div>
              ) : content?.type === 'directory' ? (
                <div className="space-y-1">
                  {content.entries?.map((entry) => (
                    <button
                      key={entry.name}
                      onClick={() => handleNavigate(entry)}
                      className="w-full text-left p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <span className="text-zinc-400">
                        {entry.isDirectory ? '📁' : '📄'}
                      </span>
                      <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                        {entry.name}
                      </span>
                    </button>
                  ))}
                  {content.entries?.length === 0 && (
                    <div className="text-center text-zinc-500 py-4">Empty directory</div>
                  )}
                </div>
              ) : (
                <pre className="text-xs font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words">
                  {content?.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
