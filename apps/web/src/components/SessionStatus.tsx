'use client';

import { useEffect, useState } from 'react';
import { useAriaSocket, type AriaSocketEvent } from '@/hooks/useAriaSocket';
import { cn } from '@/lib/utils';

/**
 * Live agent/session status indicator. Sits in the dashboard sidebar.
 * Shows: WS connection status, queue depth, last token alert.
 */
export function SessionStatus({ className }: { className?: string }) {
  const { connected, lastEvent, subscribe } = useAriaSocket();
  const [queueDepth, setQueueDepth] = useState<number | null>(null);
  const [tokenAlert, setTokenAlert] = useState<'warn' | 'hard_stop' | null>(null);

  useEffect(() => { subscribe('system.health'); }, [subscribe]);

  useEffect(() => {
    if (!lastEvent) return;
    const ev = lastEvent as AriaSocketEvent;
    if (ev.type === 'queue.depth' && 'data' in ev) {
      setQueueDepth(ev.data.totalQueueDepth);
    }
    if (ev.type === 'token.warn')      setTokenAlert('warn');
    if (ev.type === 'token.hard_stop') setTokenAlert('hard_stop');
  }, [lastEvent]);

  return (
    <div
      data-testid="session-status"
      data-connected={connected ? 'true' : 'false'}
      className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs', className)}
    >
      <span
        data-testid="session-status-dot"
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-green-500' : 'bg-red-500',
        )}
      />
      <span className="font-medium">
        {connected ? 'ARIA online' : 'ARIA offline'}
      </span>
      {queueDepth !== null && (
        <span data-testid="session-status-queue" className="text-muted-foreground">
          · queue {queueDepth}
        </span>
      )}
      {tokenAlert && (
        <span
          data-testid="session-status-token-alert"
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            tokenAlert === 'hard_stop' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
          )}
        >
          {tokenAlert === 'hard_stop' ? 'Budget hard-stop' : 'Budget 80% warn'}
        </span>
      )}
    </div>
  );
}
