'use client';
import { useEffect, useState } from 'react';
import { api, type Project } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FolderGit2, Trash2 } from 'lucide-react';
import Link from 'next/link';

function CreateProjectModal({ onCreated, onClose }: { onCreated: (p: Project) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    try {
      const res = await api.post<{ data: Project }>('/api/projects', { name, description });
      onCreated(res.data);
    } catch { setError('Failed to create project'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>New Project</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project name</Label>
              <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} placeholder="My App" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description (optional)</Label>
              <Input id="proj-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this project do?" />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.get<{ data: Project[] }>('/api/projects')
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (p: Project) => {
    setProjects(prev => [p, ...prev]);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Archive this project?')) return;
    await api.delete(`/api/projects/${id}`);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="aria" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" />New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 gap-4">
          <FolderGit2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No projects yet. Create your first one.</p>
          <Button variant="aria" onClick={() => setShowModal(true)}><Plus className="h-4 w-4 mr-2" />New Project</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => (
            <Card key={p.id} className="group relative hover:border-aria-500/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link href={`/projects/${p.id}`} className="hover:underline">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                  </Link>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    aria-label="Archive project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{p.description ?? 'No description'}</p>
                <span className={`mt-3 inline-block text-xs px-2 py-0.5 rounded-full ${
                  p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
                }`}>{p.status}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showModal && <CreateProjectModal onCreated={handleCreated} onClose={() => setShowModal(false)} />}
    </div>
  );
}
