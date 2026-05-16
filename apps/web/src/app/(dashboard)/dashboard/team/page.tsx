'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Skill, SkillStatus } from '@aria/shared';
import { Plus, Loader2, AlertCircle, Users, Cpu } from 'lucide-react';

const STATUS_COLORS: Record<SkillStatus, string> = {
  active:      'bg-emerald-500/10 text-emerald-400',
  future:      'bg-blue-500/10 text-blue-400',
  inactive:    'bg-muted text-muted-foreground',
  quarantined: 'bg-red-500/10 text-red-400',
};

function AddSkillModal({ projectId, onCreated, onClose }: { projectId: string; onCreated: (s: Skill) => void; onClose: () => void }) {
  const [slug, setSlug]           = useState('');
  const [realName, setRealName]   = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [description, setDesc]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !realName.trim() || !roleTitle.trim()) { setErr('Slug, name and role are required'); return; }
    setLoading(true);
    try {
      const d = await api<{ skill: Skill }>(`/projects/${projectId}/skills`, {
        method: 'POST',
        body: JSON.stringify({ slug: slug.trim(), realName: realName.trim(), roleTitle: roleTitle.trim(), description: description.trim() }),
      });
      onCreated(d.skill);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to add skill');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Add Skill</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. frontend-engineer" />
            </div>
            <div className="space-y-1">
              <Label>Real Name</Label>
              <Input value={realName} onChange={e => setRealName(e.target.value)} placeholder="e.g. Alex" />
            </div>
            <div className="space-y-1">
              <Label>Role Title</Label>
              <Input value={roleTitle} onChange={e => setRoleTitle(e.target.value)} placeholder="e.g. Frontend Engineer" />
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={description} onChange={e => setDesc(e.target.value)} placeholder="What does this skill do?" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="aria" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Skill'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeamPage() {
  const [projects, setProjects]    = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId]  = useState('');
  const [skills, setSkills]        = useState<Skill[]>([]);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState('');
  const [showAdd, setShowAdd]      = useState(false);

  useEffect(() => {
    api<{ projects: { id: string; name: string }[] }>('/projects')
      .then(d => { setProjects(d.projects); if (d.projects.length) setProjectId(d.projects[0].id); })
      .catch(() => setError('Failed to load projects'));
  }, []);

  const loadSkills = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const d = await api<{ skills: Skill[] }>(`/projects/${pid}/skills`);
      setSkills(d.skills);
    } catch { setError('Failed to load skills'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) loadSkills(projectId); }, [projectId, loadSkills]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-aria-400" />
          <div>
            <h1 className="text-2xl font-bold">Team & Skills</h1>
            <p className="text-sm text-muted-foreground">AI skills assigned to this project</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="aria" onClick={() => setShowAdd(true)} disabled={!projectId}>
            <Plus className="h-4 w-4 mr-2" />Add Skill
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-destructive text-sm mb-4"><AlertCircle className="h-4 w-4" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Cpu className="h-10 w-10 opacity-30" />
          <p className="font-medium">No skills yet</p>
          <p className="text-sm">Add your first AI skill to this project</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(s => (
            <Card key={s.id} className="hover:border-aria-500/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{s.realName}</CardTitle>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status as SkillStatus] ?? 'bg-muted text-muted-foreground'}`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{s.roleTitle}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{s.slug}</span>
                  <span>Risk {s.riskClass}</span>
                </div>
                {s.ownedDomains.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.ownedDomains.slice(0, 3).map(d => (
                      <span key={d} className="text-xs bg-muted px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                    {s.ownedDomains.length > 3 && <span className="text-xs text-muted-foreground">+{s.ownedDomains.length - 3}</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && projectId && (
        <AddSkillModal
          projectId={projectId}
          onCreated={s => { setSkills(prev => [...prev, s]); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
