'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/auth.context';
import { useAriaSocket } from '@/hooks/useAriaSocket';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { ErrorNote, LoadingState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ticketFromSocket, safeHref, type Sprint, type Ticket, type TicketType, type TicketStatus } from '@aria/shared';
import { PageErrorBoundary } from '@/components/ui/error-boundary';
import { stageLabel, scheduleTone } from '@/lib/ticket-stage';
import { rememberProject, rememberedProject } from '@/lib/project-selection';
import { Zap } from 'lucide-react';

// All 8 statuses from DB schema ticketStatusEnum — must be exhaustive
const COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: 'backlog',           label: 'Backlog',          color: 'border-slate-500/30' },
  { key: 'ready_for_dev',     label: 'Ready for Dev',    color: 'border-blue-500/40' },
  { key: 'in_progress',       label: 'In Progress',      color: 'border-amber-500/40' },
  { key: 'ready_for_review',  label: 'Ready for Review', color: 'border-cyan-500/40' },
  { key: 'in_qa',             label: 'In QA',            color: 'border-purple-500/60' },
  { key: 'awaiting_merge',    label: 'Awaiting merge',   color: 'border-emerald-500/30' },
  { key: 'blocked',           label: 'Blocked',          color: 'border-red-500/40' },
  { key: 'ready_for_qa',      label: 'Ready for QA',     color: 'border-purple-500/40' },
  { key: 'done',              label: 'Done',             color: 'border-emerald-500/40' },
  { key: 'rejected',          label: 'Rejected',         color: 'border-red-500/30' },
];

const TYPE_COLORS: Record<TicketType, string> = {
  bug:       'bg-red-500/10 text-red-400',
  feature:   'bg-blue-500/10 text-blue-400',
  tech_debt: 'bg-amber-500/10 text-amber-400',
  incident:  'bg-orange-500/10 text-orange-400',
  process:   'bg-slate-500/10 text-slate-400',
};

// Forward progression map — mirrors the Kanban flow
const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  backlog: 'ready_for_dev',
};

interface FlowOption { id: string; name: string; flowKey: string }
interface AgentOption { id: string; realName: string }
interface RunSignal { ticketId: string; prUrl: string | null; prNumber: number | null; live: boolean; blockedReason: string | null }

interface CreateTicketModalProps {
  projectId: string;
  onCreated: (t: Ticket) => void;
  onClose: () => void;
}

function CreateTicketModal({ projectId, flows, onCreated, onClose }: CreateTicketModalProps & { flows: FlowOption[] }) {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [type, setType]         = useState<TicketType>('feature');
  const [flowId, setFlowId]     = useState('');
  const [layer, setLayer]       = useState('');
  const [points, setPoints]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim())       { setError('Title is required');       return; }
    if (!description.trim()) { setError('Description is required'); return; }
    setLoading(true);
    try {
      const data = await api<{ ticket: Ticket }>('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title:       title.trim(),
          description: description.trim(),
          type,
          ...(flowId ? { flowId } : {}),
          ...(layer ? { layer } : {}),
          ...(points ? { storyPoints: Number(points) } : {}),
        }),
      });
      onCreated(data.ticket);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title="Create ticket" description="Add a story to the backlog.">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ticket-title">Title</Label>
              <Input
                id="ticket-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Short description"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-desc">Description</Label>
              <textarea
                id="ticket-desc"
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as TicketType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="tech_debt">Tech Debt</SelectItem>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="process">Process</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-flow">Flow</Label>
                <select id="ticket-flow" data-testid="ticket-flow" className="field" value={flowId} onChange={(event) => setFlowId(event.target.value)}>
                  <option value="">None</option>
                  {flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-layer">Layer</Label>
                <select id="ticket-layer" data-testid="ticket-layer" className="field" value={layer} onChange={(event) => setLayer(event.target.value)}>
                  <option value="">Any</option>
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                  <option value="fullstack">Full stack</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-points">Points</Label>
                <select id="ticket-points" data-testid="ticket-points" className="field" value={points} onChange={(event) => setPoints(event.target.value)}>
                  <option value="">Estimate</option>
                  {[1, 2, 3, 5, 8, 13].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  agentName: string;
  prUrl: string | null;
  prNumber: number | null;
  blockedReason: string | null;
  live: boolean;
  onStatusChange: (id: string, status: TicketStatus) => void;
  onAction: (id: string, action: 'approve' | 'unblock') => void;
}

function TicketCard({ ticket, agentName, prUrl, prNumber, blockedReason, live, onStatusChange, onAction }: TicketCardProps) {
  const typeColor = TYPE_COLORS[ticket.type as TicketType] ?? 'bg-muted text-muted-foreground';
  const next = NEXT_STATUS[ticket.status];
  const isAgentCreated = !!ticket.createdBySkillId;
  const prText = prNumber ? `PR #${prNumber}` : 'PR';

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors"
      data-testid="ticket-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {live && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Run in progress" />}
          {isAgentCreated && (
            <Zap className="h-3 w-3 text-primary shrink-0" aria-label="Created by agent" />
          )}
          <p className="text-sm font-medium leading-snug truncate">
            <Link href={`/tickets/${ticket.id}`} className="hover:underline">{ticket.title}</Link>
          </p>
        </div>
        <Badge className={typeColor}>{ticket.type.replace(/_/g, ' ')}</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge>{ticket.storyPoints ?? 1} pt</Badge>
        {ticket.issueType && <Badge data-testid="card-issue-type">{ticket.issueType}</Badge>}
        <Badge tone={scheduleTone(ticket.scheduleState)}>{stageLabel(ticket.status)}</Badge>
        {ticket.scheduleState === 'at_risk' && <Badge tone="warn">At risk</Badge>}
        {ticket.scheduleState === 'overdue' && <Badge tone="warn">Overdue</Badge>}
        {ticket.dueAt && <span className="text-xs text-muted-foreground">Due {new Date(ticket.dueAt).toLocaleDateString()}</span>}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="card-owner">Owner: {agentName}</p>
      {safeHref(prUrl) && <a className="text-xs text-primary" href={safeHref(prUrl) ?? undefined} target="_blank" rel="noreferrer">{prText}</a>}
      {blockedReason && <p className="text-xs">{blockedReason}</p>}
      {ticket.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground font-mono">Risk {ticket.riskClass}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {!ticket.humanApproved && ticket.status === 'backlog' && (
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="approve-ticket" onClick={() => onAction(ticket.id, 'approve')}>
              Approve
            </Button>
          )}
          {ticket.status === 'blocked' && (
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" data-testid="unblock-ticket" onClick={() => onAction(ticket.id, 'unblock')}>
              Unblock
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2"
              onClick={() => onStatusChange(ticket.id, next)}
              aria-label={`Move to ${next.replace(/_/g, ' ')}`}
            >
              → {next.replace(/_/g, ' ')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketsPage() {
  const { user }                     = useAuth();
  const [projects, setProjects]      = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]    = useState('');
  const [tickets,  setTickets]       = useState<Ticket[]>([]);
  const [loading,  setLoading]       = useState(false);
  const [error,    setError]         = useState('');
  const [showCreate, setShowCreate]  = useState(false);
  const [flows, setFlows]            = useState<FlowOption[]>([]);
  const [agents, setAgents]          = useState<AgentOption[]>([]);
  const [signals, setSignals]        = useState<RunSignal[]>([]);
  const [view, setView]              = useState<'board' | 'backlog' | 'sprint'>('board');
  const [sprints, setSprints]        = useState<Sprint[]>([]);
  const [sprintId, setSprintId]      = useState('');
  const [sprintName, setSprintName]  = useState('');
  const [sprintStart, setSprintStart] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which project room we're currently joined so we can leave cleanly
  const joinedProjectRef = useRef<string>('');

  // WebSocket for real-time agent updates
  const { connected, lastEvent, subscribe, unsubscribe } = useAriaSocket();

  // Load project list on mount
  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => {
        setProjects(d.projects);
        const remembered = rememberedProject();
        const next = d.projects.find((project) => project.id === remembered)?.id ?? d.projects[0]?.id ?? '';
        if (next) {
          setProjectId(next);
          rememberProject(next);
        }
      })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadTickets = useCallback(async (pid: string, mode: 'board' | 'backlog' | 'sprint', activeSprintId: string) => {
    if (!pid) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ projectId: pid });
      if (mode === 'backlog') query.set('backlog', '1');
      if (mode === 'sprint' && activeSprintId) query.set('sprintId', activeSprintId);
      const d = await api<{ tickets: Ticket[] }>(`/tickets?${query}`);
      setTickets(d.tickets);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadTickets(projectId, view, sprintId);
    api<{ flows: FlowOption[]; agents: AgentOption[] }>(`/projects/${projectId}/company`)
      .then((data) => { setFlows(data.flows); setAgents(data.agents); })
      .catch(() => { setFlows([]); setAgents([]); });
    api<{ signals: RunSignal[] }>(`/projects/${projectId}/run-signals`)
      .then((data) => setSignals(data.signals))
      .catch(() => setSignals([]));
    api<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`)
      .then((data) => {
        setSprints(data.sprints);
        const active = data.sprints.find((sprint) => sprint.status === 'active') ?? data.sprints[0];
        if (active && !sprintId) setSprintId(active.id);
      })
      .catch(() => setSprints([]));
  }, [projectId, loadTickets, view, sprintId]);

  // ── Real-time WebSocket subscription for agent-created/updated tickets ──
  // Uses the `useAriaSocket` hook's subscribe mechanism.
  // The server emits `ticket:created` and `ticket:updated` to `project:<id>` rooms.
  useEffect(() => {
    if (!connected || !projectId) return;

    // Leave old project room before joining new one
    if (joinedProjectRef.current && joinedProjectRef.current !== projectId) {
      unsubscribe(`project:${joinedProjectRef.current}`);
    }
    subscribe(`project:${projectId}`);
    joinedProjectRef.current = projectId;

    return () => {
      unsubscribe(`project:${projectId}`);
      joinedProjectRef.current = '';
    };
  }, [connected, projectId, subscribe, unsubscribe]);

  // ── Ticket event listeners (separate effect so they always use fresh state) ──
  useEffect(() => {
    if (!lastEvent || !projectId) return;
    try {
      if (lastEvent.type === 'ticket:created' || lastEvent.type === 'ticket:updated') {
        const incoming = ticketFromSocket(lastEvent);
        if (!incoming) return;
        if (incoming.projectId && incoming.projectId !== projectId) return;
        setTickets((prev) => {
          const index = prev.findIndex((ticket) => ticket.id === incoming.id);
          if (incoming.ticket && index >= 0) {
            return prev.map((ticket) => ticket.id === incoming.id ? { ...ticket, ...incoming.ticket, status: (incoming.status as TicketStatus | undefined) ?? ticket.status } : ticket);
          }
          if (incoming.ticket && lastEvent.type === 'ticket:created' && (!incoming.projectId || incoming.projectId === projectId)) {
            return [{ ...incoming.ticket, id: incoming.id, projectId, status: (incoming.status as TicketStatus | undefined) ?? 'backlog' } as Ticket, ...prev];
          }
          if (index < 0) return prev;
          if (!incoming.status) return prev;
          return prev.map((ticket) => ticket.id === incoming.id ? { ...ticket, status: incoming.status as TicketStatus } : ticket);
        });
      }
      if (lastEvent.type === 'run:updated') {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          void api<{ signals: RunSignal[] }>(`/projects/${projectId}/run-signals`).then((data) => setSignals(data.signals)).catch(() => undefined);
          void loadTickets(projectId, view, sprintId);
        }, 300);
      }
    } catch {
      // A bad socket payload must not blank the board. The route error boundary covers render throws.
    }
  }, [lastEvent, projectId, loadTickets, view, sprintId]);

  const handleStatusChange = async (id: string, status: TicketStatus) => {
    // Optimistic update
    setTickets(prev =>
      prev.map(t => t.id === id ? { ...t, status } : t),
    );
    try {
      const d = await api<{ ticket: Ticket }>(
        `/tickets/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      );
      // Confirm with server response
      setTickets(prev => prev.map(t => t.id === id ? d.ticket : t));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That move was refused.');
      void loadTickets(projectId, view, sprintId);
    }
  };

  const createSprint = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || !sprintName.trim() || !sprintStart) return;
    try {
      const data = await api<{ sprint: Sprint }>(`/projects/${projectId}/sprints`, {
        method: 'POST',
        body: JSON.stringify({ name: sprintName.trim(), startsOn: sprintStart, status: 'active' }),
      });
      setSprints((prev) => [data.sprint, ...prev]);
      setSprintId(data.sprint.id);
      setView('sprint');
      setSprintName('');
      setSprintStart('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sprint was not created.');
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'unblock') => {
    setError('');
    try {
      const d = await api<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      setTickets(prev => prev.map(t => t.id === id ? d.ticket : t));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The ticket could not be updated.');
    }
  };

  void user; // consumed via auth context — referenced to satisfy lint

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:p-6">
      <PageHeader
        title="Board"
        description={connected ? 'Stories move from backlog to done. Live updates are on.' : 'Stories move from backlog to done.'}
        action={(
          <>
            <Link href="/planning" className="self-center text-sm text-primary">Ideas</Link>
            <select
              className="field w-auto"
              aria-label="Project"
              value={projectId}
              onChange={(event) => { setProjectId(event.target.value); rememberProject(event.target.value); }}
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <Button
              onClick={() => setShowCreate(true)}
              disabled={!projectId}
              data-testid="new-ticket-btn"
            >
              New Ticket
            </Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="board-view-tabs">
        {(['board', 'backlog', 'sprint'] as const).map((mode) => (
          <Button
            key={mode}
            type="button"
            size="sm"
            variant={view === mode ? 'default' : 'outline'}
            data-testid={`view-${mode}`}
            onClick={() => setView(mode)}
          >
            {mode === 'board' ? 'Board' : mode === 'backlog' ? 'Backlog' : 'Sprint'}
          </Button>
        ))}
        {view === 'sprint' && (
          <select
            className="field w-auto"
            aria-label="Sprint"
            data-testid="sprint-select"
            value={sprintId}
            onChange={(event) => setSprintId(event.target.value)}
          >
            <option value="">Select sprint</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>{sprint.name} ({sprint.startsOn} → {sprint.endsOn})</option>
            ))}
          </select>
        )}
      </div>

      {view === 'sprint' && (
        <form
          onSubmit={createSprint}
          className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:flex-wrap sm:items-end"
          data-testid="create-sprint-form"
        >
          <label className="space-y-1 text-sm">
            <span>Sprint name</span>
            <input className="field w-full" value={sprintName} onChange={(event) => setSprintName(event.target.value)} data-testid="sprint-name" />
          </label>
          <label className="space-y-1 text-sm">
            <span>Starts on</span>
            <input className="field w-full" type="date" value={sprintStart} onChange={(event) => setSprintStart(event.target.value)} data-testid="sprint-start" />
          </label>
          <Button type="submit" variant="outline" className="shrink-0 self-start">Create 10-day sprint</Button>
        </form>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <LoadingState label="Loading the board…" />
      ) : view === 'backlog' ? (
        <div className="space-y-2" data-testid="backlog-list">
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">Backlog is empty.</p>}
          {tickets.map((ticket) => {
            const signal = signals.find((row) => row.ticketId === ticket.id);
            return (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                agentName={ticket.ownerName ?? agents.find((agent) => agent.id === (ticket.assigneeAgentId ?? ticket.assignedSkillId))?.realName ?? 'Unassigned'}
                prUrl={signal?.prUrl ?? null}
                prNumber={signal?.prNumber ?? null}
                blockedReason={ticket.status === 'blocked' ? (signal?.blockedReason ?? ticket.statusReason ?? null) : null}
                live={Boolean(signal?.live)}
                onStatusChange={handleStatusChange}
                onAction={handleAction}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
          {COLUMNS.map(col => {
            const colTickets = tickets.filter(t => t.status === col.key);
            return (
              <div
                key={col.key}
                className={`flex w-[240px] shrink-0 flex-col gap-3 border-t-2 pt-3 ${col.color}`}
                data-testid={`column-${col.key}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {colTickets.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {colTickets.length === 0 ? (
                    <p className="pointer-events-none py-6 text-center text-xs text-muted-foreground/40">Empty</p>
                  ) : (
                    colTickets.map(t => {
                      const signal = signals.find((row) => row.ticketId === t.id);
                      return (
                      <TicketCard
                        key={t.id}
                        ticket={t}
                        agentName={t.ownerName ?? agents.find(agent => agent.id === (t.assigneeAgentId ?? t.assignedSkillId))?.realName ?? 'Unassigned'}
                        prUrl={signal?.prUrl ?? null}
                        prNumber={signal?.prNumber ?? null}
                        blockedReason={t.status === 'blocked' ? (signal?.blockedReason ?? t.statusReason ?? null) : null}
                        live={Boolean(signal?.live)}
                        onStatusChange={handleStatusChange}
                        onAction={handleAction}
                      />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && projectId && (
        <CreateTicketModal
          projectId={projectId}
          flows={flows}
          onCreated={t => {
            setTickets(prev => [t, ...prev]);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

export default function TicketsBoard() {
  return (
    <PageErrorBoundary>
      <TicketsPage />
    </PageErrorBoundary>
  );
}
