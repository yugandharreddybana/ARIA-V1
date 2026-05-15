'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type Project, type ProjectRepo } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, GitBranch, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function ConnectRepoForm({ projectId, onConnected }: { projectId: string; onConnected: (r: ProjectRepo) => void }) {
  const [form, setForm] = useState({ repoUrl: '', repoName: '', branch: 'main' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ data: ProjectRepo }>(`/api/projects/${projectId}/repos`, form);
      onConnected(res.data);
      setOpen(false);
      setForm({ repoUrl: '', repoName: '', branch: 'main' });
    } catch { setError('Failed to connect repo'); }
    finally { setLoading(false); }
  };

  if (!open) return (
    <Button variant="aria" size="sm" onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4 mr-2" />Connect Repository
    </Button>
  );

  return (
    <form onSubmit={submit} className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-1">
        <Label>Repository URL</Label>
        <Input placeholder="https://github.com/org/repo" value={form.repoUrl} onChange={e => setForm(f => ({ ...f, repoUrl: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Repository name</Label>
        <Input placeholder="my-repo" value={form.repoName} onChange={e => setForm(f => ({ ...f, repoName: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Branch</Label>
        <Input placeholder="main" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="aria" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repos, setRepos] = useState<ProjectRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<{ data: Project }>(`/api/projects/${id}`),
      api.get<{ data: ProjectRepo[] }>(`/api/projects/${id}/repos`),
    ]).then(([p, r]) => {
      setProject(p.data);
      setRepos(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!project) return <div className="text-muted-foreground">Project not found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ArrowLeft className="h-4 w-4" />Back to projects
        </Link>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />Connected Repositories
          </CardTitle>
          <ConnectRepoForm projectId={project.id} onConnected={r => setRepos(prev => [...prev, r])} />
        </CardHeader>
        <CardContent>
          {repos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repositories connected yet.</p>
          ) : (
            <ul className="space-y-2">
              {repos.map(r => (
                <li key={r.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{r.repoName}</p>
                    <p className="text-xs text-muted-foreground">{r.repoUrl} · {r.branch}</p>
                  </div>
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
