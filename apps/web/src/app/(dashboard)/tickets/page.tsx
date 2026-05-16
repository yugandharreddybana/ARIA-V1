'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth.context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Ticket, TicketType, TicketStatus } from '@aria/shared';
import { Plus, Loader2, AlertCircle, Ticket as TicketIcon } from 'lucide-react';

const COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: 'backlog',        label: 'Backlog',       color: 'border-muted' },
  { key: 'ready_for_dev', label: 'Ready for Dev', color: 'border-blue-500/40' },
  { key: 'in_progress',   label: 'In Progress',   color: 'border-amber-500/40' },
  { key: 'ready_for_qa',  label: 'Ready for QA',  color: 'border-purple-500/40' },
  { key: 'in_qa',         label: 'In QA',         color: 'border-purple-500/60' },
  { key: 'done',          label: 'Done',          color: 'border-emerald-500/40' },
];

const TYPE_COLORS: Record<TicketType, string> = {
  bug:       'bg-red-500/10 text-red-400',
  feature:   'bg-blue-500/10 text-blue-400',
  tech_debt: 'bg-amber-500/10 text-amber-400',
  incident:  'bg-orange-500/10 text-orange-400',
  process:   'bg-slate-500/10 text-slate-400',
};

function CreateTicketModal({ projectId, onCreated, onClose }: { projectId: string; onCreated: (t: Ticket) => void; onClose: () => void }) {
  const [title, setTitle]      = useState('');
  const [description, setDesc] = useState('');
  const [type, setType]        = useState<TicketType>('feature');
  const [loading, setLoading]  = useState(false);
  const [err, setErr]          = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Title is required'); return; }
    if (!description.trim()) { setErr('Description is required'); return; }
    setLoading(true);
    try {
      const d = await api<{ ticket: Ticket }>('/tickets', {
        method: 'POST',
        body: JSON.stringify({ projectId, title: title.trim(), description: description.trim(), type }),
      });
      onCreated(d.ticket);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create ticket');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create ticket">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>New Ticket</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="ticket-title">Title</Label>
              <Input id="ticket-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Short description" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-desc">Description</Label>
              <textarea id="ticket-desc"
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={description} onChange={e => setDesc(e.target.value)} placeholder="What needs to be done?"
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
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
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

function TicketCard({ ticket, onStatusChange }: { ticket: Ticket; onStatusChange: (id: string, status: TicketStatus) => void }) {
  const nextStatus: Partial<Record<TicketStatus, TicketStatus>> = {
    backlog: 'ready_for_dev', ready_for_dev: 'in_progress',
    in_progress: 'ready_for_qa', ready_for_qa: 'in_qa', in_qa: 'done',
  };
  const next = nextStatus[ticket.status];
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2 hover:border-aria-500/40 transition-colors" data-testid="ticket-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{ticket.title}</p>
        <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[ticket.type as TicketType] ?? 'bg-muted text-muted-foreground'}`}>
          {ticket.type.replace('_', ' ')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">Risk {ticket.riskClass}</span>
        {next && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2"
            onClick={() => onStatusChange(ticket.id, next)}
            aria-label={`Move to ${next.replace(/_/g, ' ')}`}>
            → {next.replace(/_/g, ' ')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const { user }                    = useAuth();
  const [projects, setProjects]     = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]   = useState('');
  const [tickets, setTickets]       = useState<Ticket[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => { setProjects(d.projects); if (d.projects.length > 0) setProjectId(d.projects[0].id); })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadTickets = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const d = await api<{ tickets: Ticket[] }>(`/tickets?projectId=${encodeURIComponent(pid)}`);
      setTickets(d.tickets);
    } catch { setError('Failed to load tickets'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) loadTickets(projectId); }, [projectId, loadTickets]);

  const handleStatusChange = async (id: string, status: TicketStatus) => {
    try {
      const d = await api<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setTickets(prev => prev.map(t => t.id === id ? d.ticket : t));
    } catch { /* silent — UI stays unchanged, user can retry */ }
  };

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-5 w-5 text-aria-400" />
          <h1 className="text-2xl font-bold">Tickets</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="aria" onClick={() => setShowCreate(true)} disabled={!projectId} data-testid="new-ticket-btn">
            <Plus className="h-4 w-4 mr-2" />New Ticket
          </Button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {COLUMNS.map(col => {
            const colTickets = tickets.filter(t => t.status === col.key);
            return (
              <div key={col.key} className={`flex flex-col gap-3 min-w-[240px] max-w-[280px] border-t-2 pt-3 ${col.color}`} data-testid={`column-${col.key}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{colTickets.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {colTickets.length === 0
                    ? <p className="text-xs text-muted-foreground/50 text-center py-6">Empty</p>
                    : colTickets.map(t => <TicketCard key={t.id} ticket={t} onStatusChange={handleStatusChange} />)
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && projectId && (
        <CreateTicketModal
          projectId={projectId}
          onCreated={t => { setTickets(prev => [t, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
