'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface LogLine {
  seq: number;
  kind: string;
  message: string;
}

export function LogView({
  lines,
  onLoadEarlier,
  canLoadEarlier = false,
}: {
  lines: LogLine[];
  onLoadEarlier?: () => void;
  canLoadEarlier?: boolean;
}) {
  const [follow, setFollow] = useState(true);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: 'nearest' });
  }, [lines, follow]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onLoadEarlier?.()} disabled={!canLoadEarlier}>
          Load earlier
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-pressed={follow} onClick={() => setFollow((value) => !value)}>
          {follow ? 'Auto-scroll on' : 'Auto-scroll off'}
        </Button>
      </div>
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5"
      >
        {lines.length === 0 && <p className="text-muted-foreground">No log lines yet.</p>}
        {lines.map((line) => (
          <p key={line.seq} className="whitespace-pre-wrap break-words">
            <span className="text-muted-foreground">{line.kind}</span> {line.message}
          </p>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
