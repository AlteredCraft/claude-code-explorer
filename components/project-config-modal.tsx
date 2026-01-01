'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getProjectConfig } from '@/lib/api-client';

export function ProjectConfigModal({ encodedPath, projectName }: {
  encodedPath: string;
  projectName: string;
}) {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !config) {
      setLoading(true);
      try {
        const data = await getProjectConfig(encodedPath);
        setConfig(data.config);
        setConfigPath(data.path);
      } catch {
        setConfig({ error: 'Failed to load config' });
      }
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{projectName} Config</DialogTitle>
          <p className="text-xs text-zinc-500 font-mono">
            ~/.claude.json → projects[&quot;{configPath || '...'}&quot;]
          </p>
        </DialogHeader>
        <pre className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded text-sm overflow-auto">
          {loading ? 'Loading...' : JSON.stringify(config, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
