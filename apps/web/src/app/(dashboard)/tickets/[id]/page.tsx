'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError, downloadApi } from '@/lib/api';
import { safeHref } from '@aria/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { scheduleTone, stageLabel } from '@/lib/ticket-stage';
import type { Ticket, TicketStatus } from '@aria/shared';

const EVENT_TYPES = ['status_change', 'agent_action', 'progress', 'communication', 'run_ref', 'owner_decision', 'schedule', 'evidence'] as const;
const POINTS = [1, 2, 3, 5, 8, 13] as const;
const PAGE = 25;

interface TicketEvent {
  seq: number;
  event_type: string;
  actor_kind: string;
  agent_id: string | null;
  summary: string;
  created_at: string;
  pr_url: string | null;
}
interface Chain { ok: boolean; brokenAt: number | null; truncated?: boolean }
type ChainState = 'loading' | 'error' | 'verified' | 'broken';
interface Reports {
  dev: { valid: boolean } | null;
  qa: { valid: boolean } | null;
  gate: { ok: boolean; reason: string };
}
interface Agent { id: string; realName: string }
interface RunRow { pr_url: string | null; pr_number: number | null; activity: string; status: string }

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainState, setChainState] = useState<ChainState>('loading');
  const [reports, setReports] = useState<Reports | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pr, setPr] = useState<RunRow | null>(null);
  const [type, setType] = useState('');
  const [agentId, setAgentId] = useState('');
  const [points, setPoints] = useState('1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportError, setReportError] = useState('');
  const [more, setMore] = useState(false);
  const pointsDirty = useRef(false);

  const loadEvents = useCallback(async (after: number, replace: boolean) => {
    const query = new URLSearchParams({ limit: String(PAGE), cursor: String(after) });
    if (type) query.set('type', type);
    if (agentId) query.set('agentId', agentId);
    try {
      const data = await api<{ events: TicketEvent[]; chain: Chain }>(`/tickets/${params.id}/events?${query}`);
      setChain(data.chain);
      setChainState(data.chain.ok ? 'verified' : 'broken');
      setEvents((current) => replace ? data.events : [...current, ...data.events]);
      setMore(data.events.length === PAGE);
    } catch (err) {
      if (replace) setChainState('error');
      setError(err instanceof ApiError ? err.message : 'Could not load the activity.');
    }
  }, [agentId, params.id, type]);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setError('');
    setChainState('loading');
    try {
      const data = await api<{ ticket: Ticket }>(`/tickets/${params.id}`);
      setTicket(data.ticket);
      if (!pointsDirty.current) setPoints(String(data.ticket.storyPoints ?? 1));
      const [company, signals, report] = await Promise.all([
        api<{ agents: Agent[] }>(`/projects/${data.ticket.projectId}/company`).catch(() => ({ agents: [] as Agent[] })),
        api<{ signals: Array<{ ticketId: string; prUrl: string | null; prNumber: number | null }> }>(`/projects/${data.ticket.projectId}/run-signals`).catch(() => ({ signals: [] })),
        api<Reports>(`/tickets/${params.id}/reports`).catch(() => null),
      ]);
      setAgents(company.agents);
      const mine = signals.signals.find((row) => row.ticketId === params.id);
      setPr(mine?.prUrl ? { pr_url: mine.prUrl, pr_number: mine.prNumber, activity: '', status: '' } : null);
      setReports(report);
    } catch (err) {
      setTicket(null);
      setChainState('error');
      setError(err instanceof ApiError ? err.message : 'Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void loadTicket(); }, [loadTicket]);
  useEffect(() => { void loadEvents(0, true); }, [loadEvents]);

  async function savePoints(event: React.FormEvent) {
    event.preventDefault();
    setNotice('');
    try {
      const data = await api<{ ticket: Ticket }>(`/tickets/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ storyPoints: Number(points) }),
      });
      setTicket(data.ticket);
      pointsDirty.current = false;
      setPoints(String(data.ticket.storyPoints ?? points));
      setNotice('Story points saved.');
      await loadEvents(0, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Story points were not saved.');
    }
  }

  async function exportLog(format: 'markdown' | 'json') {
    const filename = format === 'markdown' ? `${ticket?.ticketKey || 'ticket'}.md` : `${ticket?.ticketKey || 'ticket'}.json`;
    try {
      setReportError('');
      await downloadApi(`/tickets/${params.id}/events/export?format=${format === 'markdown' ? 'markdown' : 'json'}`, filename);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : 'The activity export could not be downloaded.');
    }
  }

  async function downloadReport(path: string, filename: string) {
    try {
      setReportError('');
      await downloadApi(path, filename);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : 'The report could not be downloaded.');
    }
  }

  function gateCopy(gate: Reports['gate'] | undefined): string {
    if (!gate) return 'Reports are not ready.';
    if (gate.ok) return 'Gate passed. Both reports are valid.';
    switch (gate.reason) {
      case 'pull request head is unknown':
        return 'The pull request head is not known yet, so the gate cannot pass.';
      case 'developer evidence is missing or invalid for this pull request head':
        return 'The developer report is missing or does not match this pull request.';
      case 'qa evidence is missing or invalid for this pull request head':
        return 'The QA report is missing or does not match this pull request.';
      case 'qa verdict is not pass':
        return 'QA did not pass this pull request.';
      case 'evidence accepted':
        return 'Gate passed. Both reports are valid.';
      default:
        return 'The merge gate is not open yet.';
    }
  }

  const agentName = agents.find((agent) => agent.id === ticket?.assignedSkillId)?.realName ?? 'Unassigned';
  const names = new Map(agents.map((agent) => [agent.id, agent.realName]));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={ticket?.title ?? 'Ticket'}
        description={ticket ? `${ticket.ticketKey || 'Ticket'} · ${stageLabel(ticket.status as TicketStatus)}` : 'Activity, points, and evidence.'}
        action={<Link href="/board" className="text-sm text-primary">Back to the board</Link>}
      />
      {loading && <LoadingState label="Loading the ticket…" />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !ticket && !error && <EmptyState title="Ticket not found" description="It may belong to another workspace." />}
      {ticket && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone={scheduleTone(ticket.scheduleState)} data-testid="ticket-stage">{stageLabel(ticket.status as TicketStatus)}</Badge>
                <Badge>{agentName}</Badge>
                {ticket.scheduleState === 'at_risk' && <Badge tone="warn">At risk</Badge>}
                {ticket.scheduleState === 'overdue' && <Badge tone="warn">Overdue</Badge>}
              </div>
              <p>{ticket.statusReason || 'No blocking message.'}</p>
              {safeHref(pr?.pr_url) ? (
                <a className="text-primary" data-testid="ticket-pr" href={safeHref(pr?.pr_url) ?? undefined} target="_blank" rel="noreferrer">
                  {pr?.pr_number ? `PR #${pr.pr_number}` : 'Pull request'}
                </a>
              ) : <p>No pull request yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Story points</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePoints} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="points">Points</Label>
                  <select id="points" data-testid="edit-points" className="field w-auto" value={points} onChange={(event) => { pointsDirty.current = true; setPoints(event.target.value); }}>
                    {POINTS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <Button type="submit" variant="outline">Save points</Button>
                <p className="text-sm text-muted-foreground" data-testid="due-date">
                  {ticket.dueAt ? `Due ${new Date(ticket.dueAt).toLocaleString()}` : 'Due date starts when work starts.'}
                </p>
              </form>
              {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
              {ticket.splitSuggested && <p className="mt-2 text-sm" data-testid="split-suggestion">Split this story. 13 points is more than a week.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p data-testid="evidence-gate">{gateCopy(reports?.gate)}</p>
              <p>Dev report: {reports?.dev ? (reports.dev.valid ? 'valid' : 'invalid') : 'missing'}. QA report: {reports?.qa ? (reports.qa.valid ? 'valid' : 'invalid') : 'missing'}.</p>
              {reportError && <ErrorNote>{reportError}</ErrorNote>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" data-testid="download-dev-md" disabled={reports != null && !reports.dev} onClick={() => void downloadReport(`/tickets/${ticket.id}/reports/dev.md`, 'dev-report.md')}>Dev .md</Button>
                <Button type="button" size="sm" variant="outline" data-testid="download-dev-pdf" disabled={reports != null && !reports.dev} onClick={() => void downloadReport(`/tickets/${ticket.id}/reports/dev.pdf`, 'dev-report.pdf')}>Dev .pdf</Button>
                <Button type="button" size="sm" variant="outline" data-testid="download-qa-md" disabled={reports != null && !reports.qa} onClick={() => void downloadReport(`/tickets/${ticket.id}/reports/qa.md`, 'qa-report.md')}>QA .md</Button>
                <Button type="button" size="sm" variant="outline" data-testid="download-qa-pdf" disabled={reports != null && !reports.qa} onClick={() => void downloadReport(`/tickets/${ticket.id}/reports/qa.pdf`, 'qa-report.pdf')}>QA .pdf</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={chainState === 'verified' ? 'ok' : chainState === 'loading' ? 'neutral' : 'warn'} data-testid="chain-status">
                  {chainState === 'loading' && 'Verifying hash chain'}
                  {chainState === 'error' && 'Could not verify the hash chain'}
                  {chainState === 'verified' && `Hash chain verified${chain?.truncated ? ' for the first 5000 events' : ''}`}
                  {chainState === 'broken' && `Hash chain broken at ${chain?.brokenAt ?? 'unknown'}`}
                </Badge>
                <Button type="button" size="sm" variant="outline" data-testid="export-markdown" onClick={() => void exportLog('markdown')}>Export Markdown</Button>
                <Button type="button" size="sm" variant="outline" data-testid="export-json" onClick={() => void exportLog('json')}>Export JSON</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="text-sm">
                  <span className="sr-only">Event type</span>
                  <select className="field" aria-label="Event type" data-testid="event-type-filter" value={type} onChange={(event) => setType(event.target.value)}>
                    <option value="">Any type</option>
                    {EVENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="sr-only">Agent</span>
                  <select className="field" aria-label="Agent" data-testid="event-agent-filter" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
                    <option value="">Any agent</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.realName}</option>)}
                  </select>
                </label>
              </div>
              {events.length === 0 && <EmptyState title="No events" description="Nothing matches this filter." />}
              <ol className="space-y-3" data-testid="timeline">
                {events.map((item) => (
                  <li key={item.seq} className="rounded-md border px-3 py-2 text-sm">
                    <p className="font-medium">{item.seq}. {item.summary}</p>
                    <p className="text-muted-foreground">
                      {item.event_type} · {item.actor_kind}
                      {item.agent_id ? ` · ${names.get(item.agent_id) ?? 'Agent'}` : ''}
                      {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
              {more && (
                <Button type="button" variant="outline" onClick={() => void loadEvents(events[events.length - 1]?.seq ?? 0, false)}>
                  Load more
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
