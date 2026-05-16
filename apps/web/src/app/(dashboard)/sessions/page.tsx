'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { Session, SessionMode, MissionType, CreateSessionRequest } from '@aria/shared';
import { Plus, Loader2, AlertCircle, Play, Clock, CheckCircle2, XCircle, Zap } from 'lucide-react';

const STATE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  new:           { label: 'New',           color: 'text-muted-foreground', icon: Clock },
  bootstrapping: { label: 'Bootstrapping', color: 'text-blue-400',         icon: Loader2 },
  scrumming:     { label: 'Scrumming',     color: 'text-amber-400',        icon: Zap },
  working:       { label: 'Working',       color: 'text-aria-400',         icon: Play },
  paused:        { label: 'Paused',        color: 'text-muted-foreground', icon: Clock },
  completed:     { label: 'Completed',     color: 'text-emerald-400',      icon: CheckCircle2 },
  failed:        { label: 'Failed',        color: 'text-destructive',      icon: XCircle },
};

function StartSessionModal({ projectId, onCreated, onClose }: { projectId: string; onCreated: (s: Session) => void; onClose: () => void }) {
  const [mode, setMode]               = useState<SessionMode>('precision');
  const [missionType, setMissionType] = useState<MissionType>('feature');
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body: CreateSessionRequest = { projectId, mode, missionType };
      const d = await api<{ session: Session }>('/sessions', { method: 'POST', body: JSON.stringify(body) });
      onCreated(d.session);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to start session');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Start Session</CardTitle>
          <CardDescription>Launch an AI work session for this project</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={v => setMode(v as SessionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="precision">Precision — careful, reviewed</SelectItem>
                  <SelectItem value="throughput">Throughput — fast, high volume</SelectItem>
                  <SelectItem value="planning">Planning — strategy &amp; spec</SelectItem>
                  <SelectItem value="shadow">Shadow — observe only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mission Type</Label>
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
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="aria" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-3.5 w-3.5 mr-1.5" />Start</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SessionsPage() {
  const [projects, setProjects]     = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]   = useState('');
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showStart, setShowStart]   = useState(false);

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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">Each session is a focused AI work cycle</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="aria" onClick={() => setShowStart(true)} disabled={!projectId}>
            <Plus className="h-4 w-4 mr-2" />Start Session
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-destructive text-sm mb-4"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Zap className="h-10 w-10 opacity-30" />
          <p className="font-medium">No sessions yet</p>
          <p className="text-sm">Start a session to kick off an AI work cycle</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const cfg = STATE_CONFIG[s.state] ?? STATE_CONFIG.new;
            const Icon = cfg.icon;
            return (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${cfg.color} flex items-center gap-1`}>
                          <Icon className="h-3.5 w-3.5" />{cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground capitalize">{s.mode}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground capitalize">{s.missionType.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">{s.id.slice(0, 8)}…</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{new Date(s.startedAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showStart && projectId && (
        <StartSessionModal
          projectId={projectId}
          onCreated={s => { setSessions(prev => [s, ...prev]); setShowStart(false); }}
          onClose={() => setShowStart(false)}
        />
      )}
    </div>
  );
}
