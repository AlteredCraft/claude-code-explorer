'use client';

import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ColumnInfoModalProps {
  title: string;
  children: React.ReactNode;
}

export function ColumnInfoModal({ title, children }: ColumnInfoModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 inline-flex">
          <Info className="h-3 w-3 text-zinc-400" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
