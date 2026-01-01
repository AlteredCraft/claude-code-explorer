'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getAppSettings, updateAppSettings, type AppSettings } from '@/lib/api-client';

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ pathPrefix: [] });
  const [newPrefix, setNewPrefix] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getAppSettings();
      setSettings(data);
    } catch {
      setSettings({ pathPrefix: [] });
    }
    setLoading(false);
  };

  const handleAddPrefix = () => {
    const trimmed = newPrefix.trim();
    if (trimmed && !settings.pathPrefix.includes(trimmed)) {
      setSettings({
        ...settings,
        pathPrefix: [...settings.pathPrefix, trimmed],
      });
      setNewPrefix('');
    }
  };

  const handleRemovePrefix = (prefix: string) => {
    setSettings({
      ...settings,
      pathPrefix: settings.pathPrefix.filter(p => p !== prefix),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAppSettings(settings);
      setOpen(false);
      // Refresh the page to apply new filters
      window.location.reload();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddPrefix();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Filter projects by path prefix. Only projects under these paths will be shown.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-4 text-center text-sm text-zinc-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Project Path Filters
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
                Leave empty to show all projects
              </p>
            </div>

            {settings.pathPrefix.length > 0 && (
              <div className="space-y-2">
                {settings.pathPrefix.map((prefix) => (
                  <div
                    key={prefix}
                    className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-md px-3 py-2"
                  >
                    <span className="flex-1 font-mono text-sm truncate">{prefix}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleRemovePrefix(prefix)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="~/Projects"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleAddPrefix}
                disabled={!newPrefix.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
