'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAriaSocket } from '@/hooks/useAriaSocket';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { LogView, type LogLine } from '@/components/ui/log-view';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { rememberedProject, rememberProject } from '@/lib/project-selection';

interface ProjectRow { id: string; name: string }
interface AgentRow { id: string; realName: string }
interface RunRow {
  id: string;
  status: string;
  activity: string;
  agent_id: string | null;
  ticket_id: string | null;
  parent_run_id: string | null;
  pr_url: string | null;
  pr_number: number | null;
  model_id: string | null;
  tokens_reserved: number;
  tokens_total: number | null;
  error_code: string | null;
  blocked_reason: string | null;
  external_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
interface Budget {
  limit: number;
  used: number;
  reserved: number;
  warnAt: number;
}
interface LogResponse { lines: LogLine[] }

const STATUSES = ['', 'queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled'] as const;
const ACTIVITIES = ['', 'develop', 'review', 'fix', 'qa', 'knowledge_map', 'company_generation', 'story_points'] as const;

function tone(status: string): 'accent' | 'ok' | 'warn' | 'off' | 'neutral' {
  if (status === 'succeeded') return 'ok';
  if (status === 'running' || status === 'queued') return 'accent';
  if (status === 'blocked' || status === 'failed') return 'warn';
  if (status === 'cancelled') return 'off';
  return 'neutral';
}

function duration(run: RunRow): string {
  if (!run.started_at) return '—';
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(run.started_at).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function prLabel(url: string | null, number: number | null): string {
  if (number) return `PR #${number}`;
  if (!url) return '';
  const match = url.match(/\/pull\/(\d+)/);
  return match ? `PR #${match[1]}` : 'PR';
}

export function AgentRuns() {
  const params = useSearchParams();
  const { connected, subscribe, unsubscribe, onEvent } = useAriaSocket();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState(params.get('project') ?? '');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetWarn, setBudgetWarn] = useState('');
  const [status, setStatus] = useState('');
  const [activity, setActivity] = useState('');
  const [agentId, setAgentId] = useState(params.get('agent') ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    api<{ projects: ProjectRow[] }>('/projects')
      .then((data) => {
        setProjects(data.projects);
        setProjectId((current) => current || params.get('project') || rememberedProject() || data.projects[0]?.id || '');
      })
      .catch(() => setError('Could not load projects.'))
      .finally(() => setLoading(false));
  }, [params]);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setError('');
    const query = new URLSearchParams({ limit: '50' });
    if (status) query.set('status', status);
    if (activity) query.set('activity', activity);
    if (agentId) query.set('agentId', agentId);
    const [runData, budgetData, company] = await Promise.all([
      api<{ runs: RunRow[] }>(`/projects/${pid}/runs?${query}`),
      api<Budget>(`/projects/${pid}/budget`),
      api<{ agents: AgentRow[] }>(`/projects/${pid}/company`).catch(() => ({ agents: [] as AgentRow[] })),
    ]);
    setRuns(runData.runs);
    setBudget(budgetData);
    setAgents(company.agents);
    rememberProject(pid);
  }, [activity, agentId, status]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    load(projectId).catch(() => setError('Could not load runs.')).finally(() => setLoading(false));
  }, [projectId, load]);

  useEffect(() => {
    if (!connected || !projectId) return;
    subscribe(`project:${projectId}`);
    return () => unsubscribe(`project:${projectId}`);
  }, [connected, projectId, subscribe, unsubscribe]);

  useEffect(() => onEvent((event) => {
    if (event.type === 'budget:warn' && event.projectId === projectId) {
      setBudgetWarn(`Budget warning: ${event.used.toLocaleString()} of ${event.limit.toLocaleString()} tokens used this month.`);
    }
    if (event.type === 'run:updated') {
      void load(projectId).catch(() => undefined);
    }
    if (event.type === 'run:log' && event.runId === selected) {
      setLogs((current) => {
        const seen = new Set(current.map((line) => line.seq));
        const next = event.lines.filter((line) => !seen.has(line.seq));
        return next.length ? [...current, ...next].sort((a, b) => a.seq - b.seq) : current;
      });
    }
  }), [load, onEvent, projectId, selected]);

  const names = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.realName])), [agents]);
  const open = runs.find((run) => run.id === selected) ?? null;
  const children = open ? runs.filter((run) => run.parent_run_id === open.id) : [];

  useEffect(() => {
    if (!selected) return;
    setLogs([]);
    api<LogResponse>(`/runs/${selected}/logs?afterSeq=0&limit=500`)
      .then((data) => setLogs(data.lines))
      .catch(() => setActionError('Could not load logs.'));
  }, [selected]);

  async function act(path: string) {
    if (!selected) return;
    setActionError('');
    try {
      await api(path, { method: 'POST' });
      await load(projectId);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'The run could not be updated.');
    }
  }

  const overWarn = budget != null && budget.used + budget.reserved >= budget.warnAt;

  return (
    <section aria-labelledby="agent-runs-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="agent-runs-title" className="text-lg font-semibold">Queue</h2>
        <label className="text-sm">
          <span className="mr-2 text-muted-foreground">Project</span>
          <select
            className="field w-auto"
            aria-label="Project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>

      {budget && (
        <p className="text-sm" data-testid="budget-usage" role={overWarn || budgetWarn ? 'status' : undefined}>
          This month: {budget.used.toLocaleString()} used, {budget.reserved.toLocaleString()} reserved, limit {budget.limit.toLocaleString()} tokens.
          {(overWarn || budgetWarn) && <span className="ml-2 font-medium">{budgetWarn || 'Usage is at the warning line.'}</span>}
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap gap-2">
        <label className="text-sm">
          <span className="sr-only">Status</span>
          <select className="field" aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => <option key={value || 'any'} value={value}>{value || 'Any status'}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Activity</span>
          <select className="field" aria-label="Activity" value={activity} onChange={(event) => setActivity(event.target.value)}>
            {ACTIVITIES.map((value) => <option key={value || 'any'} value={value}>{value || 'Any activity'}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Agent</span>
          <select className="field" aria-label="Agent" data-testid="run-agent-filter" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">Any agent</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.realName}</option>)}
          </select>
        </label>
      </div>

      {loading && <LoadingState label="Loading runs…" />}
      {!loading && !error && runs.length === 0 && (
        <EmptyState
          title="No agent runs yet"
          description="When agents start work, each run shows its status, model, tokens, and pull request here."
        />
      )}
      {!loading && runs.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Status</TH>
              <TH>Activity</TH>
              <TH>Agent</TH>
              <TH>Ticket</TH>
              <TH>PR</TH>
              <TH>Model</TH>
              <TH>Tokens</TH>
              <TH>Started</TH>
              <TH>Duration</TH>
            </TR>
          </THead>
          <TBody>
            {runs.map((run) => (
              <TR
                key={run.id}
                data-testid="run-row"
                tabIndex={0}
                className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelected(run.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(run.id);
                  }
                }}
              >
                <TD>
                  <Badge tone={tone(run.status)}>{run.status}{run.blocked_reason ? ` · ${run.blocked_reason}` : ''}</Badge>
                </TD>
                <TD>{run.activity}</TD>
                <TD>{run.agent_id ? (names.get(run.agent_id) ?? 'Agent') : 'System'}</TD>
                <TD>
                  {run.ticket_id ? <Link className="text-primary" href={`/tickets/${run.ticket_id}`} onClick={(event) => event.stopPropagation()}>Ticket</Link> : '—'}
                </TD>
                <TD>
                  {run.pr_url ? <a className="text-primary" href={run.pr_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{prLabel(run.pr_url, run.pr_number)}</a> : '—'}
                </TD>
                <TD>{run.model_id ?? '—'}</TD>
                <TD>{run.tokens_total ?? '—'} / {run.tokens_reserved}</TD>
                <TD>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</TD>
                <TD>{duration(run)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setSelected(null); }}>
        {open && (
          <DialogContent
            title={`${open.activity} · ${open.status}`}
            description={open.blocked_reason ? `Blocked: ${open.blocked_reason}` : 'Run detail'}
            className="w-[min(48rem,calc(100dvw-1rem))]"
          >
            <div className="space-y-4" data-testid="run-detail">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(open.status)}>{open.status}{open.error_code ? ` · ${open.error_code}` : ''}</Badge>
                {open.external_url && <a className="text-sm text-primary" href={open.external_url} target="_blank" rel="noreferrer">Open in Cursor</a>}
                {(open.status === 'queued' || open.status === 'running') && (
                  <Button type="button" size="sm" variant="outline" data-testid="cancel-run" onClick={() => void act(`/runs/${open.id}/cancel`)}>Cancel</Button>
                )}
                {(open.status === 'failed' || open.status === 'cancelled' || open.status === 'blocked') && (
                  <Button type="button" size="sm" data-testid="retry-run" onClick={() => void act(`/runs/${open.id}/retry`)}>Retry</Button>
                )}
              </div>
              {actionError && <ErrorNote>{actionError}</ErrorNote>}
              <p className="text-sm">
                Ticket {open.ticket_id ? <Link className="text-primary" href={`/tickets/${open.ticket_id}`}>open</Link> : '—'}
                {' · '}Run <span className="font-mono">{open.id.slice(0, 8)}</span>
                {' · '}{open.pr_url ? <a className="text-primary" href={open.pr_url} target="_blank" rel="noreferrer">{prLabel(open.pr_url, open.pr_number)}</a> : 'No pull request'}
              </p>
              <p className="text-sm">Model {open.model_id ?? 'not chosen yet'}. Tokens {open.tokens_total ?? '—'} actual / {open.tokens_reserved} reserved.</p>
              {children.length > 0 && (
                <ul className="text-sm">
                  {children.map((child) => (
                    <li key={child.id}>
                      <button type="button" className="text-primary" onClick={() => setSelected(child.id)}>{child.activity} · {child.status}</button>
                    </li>
                  ))}
                </ul>
              )}
              <LogView lines={logs} canLoadEarlier={logs.length > 0 && logs[0].seq > 1} onLoadEarlier={() => {
                void api<LogResponse>(`/runs/${open.id}/logs?afterSeq=0&limit=500`).then((data) => setLogs(data.lines));
              }} />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
