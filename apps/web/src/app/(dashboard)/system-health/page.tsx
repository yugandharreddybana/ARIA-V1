'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface IncidentRow {
  id: string;
  detectedAt: string;
  source: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  title: string;
  status: 'open' | 'investigating' | 'mitigated' | 'resolved' | 'postmortem';
}

interface QueueStatus {
  totalQueueDepth: number;
  acceptingRequests: boolean;
  queueDepthByPriority: Record<string, number>;
  inflightByBackend: Record<string, number>;
  rejectedCount: number;
}

/**
 * System Health (V27.9 §17 + §18H).
 * Surfaces: live Token Gateway queue status, recent incidents, SLO breach badges.
 */
export default function SystemHealthPage() {
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [q, inc] = await Promise.allSettled([
        api<{ success: true; data: QueueStatus }>('/llm/queue/status'),
        api<{ success: true; data: IncidentRow[] }>('/incidents'),
      ]);
      if (q.status === 'fulfilled')   setQueue(q.value.data);
      if (inc.status === 'fulfilled') setIncidents(inc.value.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4" data-testid="system-health-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
          <p className="text-sm text-muted-foreground">Live Token Gateway queue + recent incidents + SLO status.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} data-testid="refresh">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card data-testid="queue-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Token Gateway</CardTitle>
          <CardDescription>Live queue depth, in-flight requests, and backpressure status.</CardDescription>
        </CardHeader>
        <CardContent>
          {!queue && loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {queue && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Total queue depth"     value={queue.totalQueueDepth} />
              <Stat label="Accepting requests"    value={queue.acceptingRequests ? 'YES' : 'NO'} />
              <Stat label="Rejected (cumulative)" value={queue.rejectedCount} />
              <Stat label="Backends in flight"    value={Object.values(queue.inflightByBackend).reduce((a, b) => a + b, 0)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="incidents-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Recent Incidents</CardTitle>
          <CardDescription>Last 20 declared incidents (most recent first).</CardDescription>
        </CardHeader>
        <CardContent>
          {!incidents.length && !loading && <p className="text-sm text-muted-foreground" data-testid="incidents-empty">No incidents recorded.</p>}
          <ul className="divide-y divide-border/40">
            {incidents.map(i => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm" data-testid={`incident-${i.severity}`}>
                <span className={'rounded px-1.5 py-0.5 text-[10px] font-medium ' + sevClass(i.severity)}>{i.severity}</span>
                <span className="font-medium">{i.title}</span>
                <span className="ml-auto text-muted-foreground">{i.status}</span>
                <span className="text-muted-foreground text-xs">{new Date(i.detectedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function sevClass(s: IncidentRow['severity']): string {
  switch (s) {
    case 'P0': return 'bg-red-100 text-red-700';
    case 'P1': return 'bg-amber-100 text-amber-700';
    case 'P2': return 'bg-yellow-50 text-yellow-700';
    default:   return 'bg-zinc-100 text-zinc-700';
  }
}
