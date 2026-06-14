'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth.context';
import { useAriaSocket } from '@/hooks/useAriaSocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Ticket, TicketType, TicketStatus } from '@aria/shared';
import { Plus, Loader2, AlertCircle, Ticket as TicketIcon, Zap } from 'lucide-react';

// All 8 statuses from DB schema ticketStatusEnum — must be exhaustive
const COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: 'backlog',           label: 'Backlog',          color: 'border-slate-500/30' },
  { key: 'ready_for_dev',     label: 'Ready for Dev',    color: 'border-blue-500/40' },
  { key: 'in_progress',       label: 'In Progress',      color: 'border-amber-500/40' },
  { key: 'ready_for_qa',      label: 'Ready for QA',     color: 'border-purple-500/40' },
  { key: 'in_qa',             label: 'In QA',            color: 'border-purple-500/60' },
  { key: 'ready_for_review',  label: 'Ready for Review', color: 'border-cyan-500/40' },
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
  backlog:          'ready_for_dev',
  ready_for_dev:    'in_progress',
  in_progress:      'ready_for_qa',
  ready_for_qa:     'in_qa',
  in_qa:            'ready_for_review',
  ready_for_review: 'done',
};

interface CreateTicketModalProps {
  projectId: string;
  onCreated: (t: Ticket) => void;
  onClose: () => void;
}

function CreateTicketModal({ projectId, onCreated, onClose }: CreateTicketModalProps) {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [type, setType]         = useState<TicketType>('feature');
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create ticket"
    >
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>New Ticket</CardTitle></CardHeader>
        <CardContent>
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
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" variant="aria" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface TicketCardProps {
  ticket: Ticket;
  onStatusChange: (id: string, status: TicketStatus) => void;
}

function TicketCard({ ticket, onStatusChange }: TicketCardProps) {
  const typeColor = TYPE_COLORS[ticket.type as TicketType] ?? 'bg-muted text-muted-foreground';
  const next = NEXT_STATUS[ticket.status];
  const isAgentCreated = !!ticket.createdBySkillId;

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 space-y-2 hover:border-aria-500/40 transition-colors"
      data-testid="ticket-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isAgentCreated && (
            <Zap
              className="h-3 w-3 text-aria-400 shrink-0"
              aria-label="Created by agent"
            />
          )}
          <p className="text-sm font-medium leading-snug truncate">{ticket.title}</p>
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${typeColor}`}>
          {ticket.type.replace(/_/g, ' ')}
        </span>
      </div>
      {ticket.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">Risk {ticket.riskClass}</span>
          {!ticket.humanApproved && isAgentCreated && (
            <span className="text-xs px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">
              Pending approval
            </span>
          )}
        </div>
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
  );
}

export default function TicketsPage() {
  const { user }                     = useAuth();
  const [projects, setProjects]      = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]    = useState('');
  const [tickets,  setTickets]       = useState<Ticket[]>([]);
  const [loading,  setLoading]       = useState(false);
  const [error,    setError]         = useState('');
  const [showCreate, setShowCreate]  = useState(false);

  // Track which project room we're currently joined so we can leave cleanly
  const joinedProjectRef = useRef<string>('');

  // WebSocket for real-time agent updates
  const { connected, subscribe, unsubscribe } = useAriaSocket();

  // Load project list on mount
  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => {
        setProjects(d.projects);
        if (d.projects.length > 0) setProjectId(d.projects[0].id);
      })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadTickets = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    setError('');
    try {
      const d = await api<{ tickets: Ticket[] }>(
        `/tickets?projectId=${encodeURIComponent(pid)}`,
      );
      setTickets(d.tickets);
    } catch {
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) loadTickets(projectId);
  }, [projectId, loadTickets]);

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
  const { lastEvent } = useAriaSocket();
  useEffect(() => {
    if (!lastEvent) return;

    if ((lastEvent as { type: string }).type === 'ticket:created') {
      const incoming = (lastEvent as unknown as { ticket: Ticket }).ticket;
      if (incoming.projectId !== projectId) return;
      setTickets(prev => {
        if (prev.some(t => t.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    }

    if ((lastEvent as { type: string }).type === 'ticket:updated') {
      const incoming = (lastEvent as unknown as { ticket: Ticket }).ticket;
      if (incoming.projectId !== projectId) return;
      setTickets(prev => prev.map(t => t.id === incoming.id ? incoming : t));
    }
  }, [lastEvent, projectId]);

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
    } catch {
      // Revert optimistic update on failure
      loadTickets(projectId);
    }
  };

  void user; // consumed via auth context — referenced to satisfy lint

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-5 w-5 text-aria-400" />
          <h1 className="text-2xl font-bold">Tickets</h1>
          {connected && (
            <span
              className="flex items-center gap-1 text-xs text-emerald-400"
              title="Live updates active"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="aria"
            onClick={() => setShowCreate(true)}
            disabled={!projectId}
            data-testid="new-ticket-btn"
          >
            <Plus className="h-4 w-4 mr-2" />New Ticket
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
          {COLUMNS.map(col => {
            const colTickets = tickets.filter(t => t.status === col.key);
            return (
              <div
                key={col.key}
                className={`flex flex-col gap-3 min-w-[220px] max-w-[260px] border-t-2 pt-3 ${col.color}`}
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
                    <p className="text-xs text-muted-foreground/40 text-center py-6">Empty</p>
                  ) : (
                    colTickets.map(t => (
                      <TicketCard
                        key={t.id}
                        ticket={t}
                        onStatusChange={handleStatusChange}
                      />
                    ))
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
