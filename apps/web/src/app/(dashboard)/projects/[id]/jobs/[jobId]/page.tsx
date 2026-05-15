'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, Zap, RefreshCw } from 'lucide-react';
import type { AnalysisJob } from '@aria/shared';

const STATUS_CONFIG = {
  queued:  { label: 'Queued',   icon: Clock,         color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  running: { label: 'Running',  icon: Loader2,        color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
  done:    { label: 'Complete', icon: CheckCircle2,   color: 'text-emerald-400',bg: 'bg-emerald-500/10'},
  failed:  { label: 'Failed',   icon: XCircle,        color: 'text-destructive', bg: 'bg-destructive/10'},
} as const;

const TERMINAL = new Set(['done', 'failed']);
const POLL_MS  = 5_000;

export default function JobDetailPage() {
  const { id: projectId, jobId } = useParams<{ id: string; jobId: string }>();
  const router = useRouter();
  const [job, setJob]         = useState<AnalysisJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchJob = useCallback(async () => {
    try {
      const data = await api<{ job: AnalysisJob }>(`/analysis/jobs/${jobId}`);
      setJob(data.job);
      setError('');
      return data.job.status;
    } catch {
      setError('Failed to load job status');
      return 'failed';
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const status = await fetchJob();
      if (!TERMINAL.has(status as string)) {
        timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => clearTimeout(timer);
  }, [fetchJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cfg = job ? STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.queued : null;
  const StatusIcon = cfg?.icon ?? Clock;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back nav */}
      <button
        onClick={() => router.push(`/projects/${projectId}`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Project
      </button>

      <div className="flex items-center gap-3 mb-6">
        <Zap className="h-5 w-5 text-aria-400" />
        <h1 className="text-2xl font-bold">Analysis Job</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {job && cfg && (
        <div className="space-y-4">
          {/* Status card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${cfg.bg} ${cfg.color}`}>
                <StatusIcon className={`h-4 w-4 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                {cfg.label}
              </div>
              {!TERMINAL.has(job.status) && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Auto-refreshing every 5 seconds…
                </p>
              )}
            </CardContent>
          </Card>

          {/* Details card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
              <CardDescription>Job metadata from the analysis engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Job ID',     value: job.jobId },
                { label: 'Repository', value: job.repoUrl },
                { label: 'Branch',     value: job.branch },
                { label: 'Triggered',  value: new Date(job.createdAt).toLocaleString() },
                { label: 'Updated',    value: new Date(job.updatedAt).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                  <span className="text-xs font-mono text-right break-all">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Failed error message */}
          {job.status === 'failed' && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Analysis Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  The analysis job encountered an error. You can re-trigger analysis from the project page.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push(`/projects/${projectId}`)}
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Project
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Done success */}
          {job.status === 'done' && (
            <Card className="border-emerald-500/30">
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">
                  Analysis complete. The concept graph for this repository is ready.
                </p>
                <Button
                  variant="aria"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push(`/projects/${projectId}/graph`)}
                >
                  View Concept Graph →
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
