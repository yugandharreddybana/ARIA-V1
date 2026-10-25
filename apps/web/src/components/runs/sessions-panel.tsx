'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import type { Session, SessionMode, MissionType, CreateSessionRequest } from '@aria/shared';

const STATE_LABEL: Record<string, string> = {
  new: 'New',
  bootstrapping: 'Bootstrapping',
  scrumming: 'Scrumming',
  working: 'Working',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
};

function StartSessionModal({ projectId, onCreated, onClose }: { projectId: string; onCreated: (s: Session) => void; onClose: () => void }) {
  const [mode, setMode] = useState<SessionMode>('precision');
  const [missionType, setMissionType] = useState<MissionType>('feature');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body: CreateSessionRequest = { projectId, mode, missionType };
      const d = await api<{ session: Session }>('/sessions', { method: 'POST', body: JSON.stringify(body) });
      onCreated(d.session);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Failed to start session');
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title="Start session" description="Launch one work cycle for this project.">
        <form onSubmit={submit} className="space-y-4">
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={v => setMode(v as SessionMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="precision">Precision — careful, reviewed</SelectItem>
                <SelectItem value="throughput">Throughput — fast, high volume</SelectItem>
                <SelectItem value="planning">Planning — strategy and spec</SelectItem>
                <SelectItem value="shadow">Shadow — observe only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mission type</Label>
            <Select value={missionType} onValueChange={v => setMissionType(v as MissionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="stability">Stability</SelectItem>
                <SelectItem value="tech_debt">Tech Debt</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="planning">Planning</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Starting…' : 'Start'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SessionsPanel() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showStart, setShowStart] = useState(false);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => { setProjects(d.projects); if (d.projects.length) setProjectId(d.projects[0].id); })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadSessions = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const d = await api<{ sessions: Session[] }>(`/sessions?projectId=${pid}`);
      setSessions(d.sessions);
    } catch { setError('Failed to load sessions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) loadSessions(projectId); }, [projectId, loadSessions]);

  return (
    <section className="space-y-4" aria-labelledby="sessions-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="sessions-title" className="text-lg font-semibold">Sessions</h2>
          <p className="text-sm text-muted-foreground">A session is one focused work cycle.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => setShowStart(true)} disabled={!projectId} data-testid="new-session-btn">
            Start Session
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading ? <LoadingState label="Loading sessions…" /> : sessions.length === 0 ? (
        <EmptyState title="No sessions yet" description="Start a session when you want the company to work a cycle." />
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <Card key={s.id} data-testid="session-card">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{STATE_LABEL[s.state] ?? s.state}</p>
                    <p className="text-xs capitalize text-muted-foreground">{s.mode} · {s.missionType.replace('_', ' ')}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}…</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showStart && projectId && (
        <StartSessionModal
          projectId={projectId}
          onCreated={s => { setSessions(prev => [s, ...prev]); setShowStart(false); }}
          onClose={() => setShowStart(false)}
        />
      )}
    </section>
  );
}
