'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { IdeaCard, IdeaStatus } from '@aria/shared';
import { Plus, Loader2, AlertCircle, Lightbulb, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_CONFIG: Record<IdeaStatus, { label: string; color: string }> = {
  draft:            { label: 'Draft',            color: 'bg-muted text-muted-foreground' },
  ready_for_review: { label: 'Ready for Review', color: 'bg-blue-500/10 text-blue-400' },
  approved:         { label: 'Approved',         color: 'bg-emerald-500/10 text-emerald-400' },
  rejected:         { label: 'Rejected',         color: 'bg-red-500/10 text-red-400' },
  in_development:   { label: 'In Development',   color: 'bg-amber-500/10 text-amber-400' },
};

function CreateIdeaModal({ projectId, onCreated, onClose }: { projectId: string; onCreated: (i: IdeaCard) => void; onClose: () => void }) {
  const [title, setTitle]       = useState('');
  const [summary, setSummary]   = useState('');
  const [userImpact, setUser]   = useState('');
  const [bizImpact, setBiz]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim() || !userImpact.trim() || !bizImpact.trim()) {
      setErr('All fields are required'); return;
    }
    setLoading(true);
    try {
      const d = await api<{ idea: IdeaCard }>('/ideas', {
        method: 'POST',
        body: JSON.stringify({ projectId, title: title.trim(), summary: summary.trim(), potentialUserImpact: userImpact.trim(), potentialBusinessImpact: bizImpact.trim() }),
      });
      onCreated(d.idea);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create idea');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>New Idea</CardTitle>
          <CardDescription>Propose a feature or improvement for human review</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            {err && <p className="text-sm text-destructive">{err}</p>}
            {[
              { label: 'Title',           value: title,      set: setTitle,   placeholder: 'What is the idea?' },
              { label: 'Summary',         value: summary,    set: setSummary, placeholder: 'Brief description' },
              { label: 'User Impact',     value: userImpact, set: setUser,    placeholder: 'How does it help users?' },
              { label: 'Business Impact', value: bizImpact,  set: setBiz,     placeholder: 'Why does it matter to the business?' },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                <Input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} />
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="aria" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Idea'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlanningPage() {
  const [projects, setProjects]     = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]   = useState('');
  const [ideas, setIdeas]           = useState<IdeaCard[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => { setProjects(d.projects); if (d.projects.length) setProjectId(d.projects[0].id); })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadIdeas = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const d = await api<{ ideas: IdeaCard[] }>(`/ideas?projectId=${pid}`);
      setIdeas(d.ideas);
    } catch { setError('Failed to load ideas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) loadIdeas(projectId); }, [projectId, loadIdeas]);

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      const d = await api<{ idea: IdeaCard }>(`/ideas/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ approved }) });
      setIdeas(prev => prev.map(i => i.id === id ? d.idea : i));
    } catch { /* silent */ }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5 text-aria-400" />
          <div>
            <h1 className="text-2xl font-bold">Planning</h1>
            <p className="text-sm text-muted-foreground">Idea cards waiting for human approval</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button
            variant="aria"
            onClick={() => setShowCreate(true)}
            disabled={!projectId}
            data-testid="new-idea-btn"
          >
            <Plus className="h-4 w-4 mr-2" />New Idea
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-destructive text-sm mb-4"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Lightbulb className="h-10 w-10 opacity-30" />
          <p className="font-medium">No ideas yet</p>
          <p className="text-sm">Submit an idea to start the planning process</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map(idea => {
            const cfg = STATUS_CONFIG[idea.status as IdeaStatus] ?? STATUS_CONFIG.draft;
            const isPending = idea.status === 'draft' || idea.status === 'ready_for_review';
            return (
              <Card key={idea.id} data-testid="idea-card">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{idea.title}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <CardDescription>{idea.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">User Impact</p>
                      <p className="text-xs">{idea.potentialUserImpact}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Business Impact</p>
                      <p className="text-xs">{idea.potentialBusinessImpact}</p>
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs gap-1.5 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        onClick={() => handleApprove(idea.id, true)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />Approve
                      </Button>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => handleApprove(idea.id, false)}>
                        <XCircle className="h-3.5 w-3.5" />Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && projectId && (
        <CreateIdeaModal
          projectId={projectId}
          onCreated={i => { setIdeas(prev => [i, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
