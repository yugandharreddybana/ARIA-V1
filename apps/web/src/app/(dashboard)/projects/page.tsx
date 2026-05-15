'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@aria/shared';
import { Plus, FolderOpen, Loader2, Github } from 'lucide-react';

function CreateModal({ onCreated, onClose }: { onCreated: (p: Project) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }
    setLoading(true);
    try {
      const d = await api<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }) });
      onCreated(d.project);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>New Project</CardTitle><CardDescription>Create a workspace for your AI team</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="pname">Name</Label>
              <Input id="pname" value={name} onChange={e => setName(e.target.value)} placeholder="My Platform" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdesc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="pdesc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this project?" />
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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then(d => setProjects(d.projects)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Each project maps to one or more GitHub repositories</p>
        </div>
        <Button variant="aria" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Project</Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-3">
          <FolderOpen className="h-12 w-12 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm">Create your first project to get started</p>
          <Button variant="aria" className="mt-2" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Create Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-aria-500/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{p.status}</span>
                  </div>
                  {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Github className="h-3.5 w-3.5" />
                    <span>{(p as { repos?: unknown[] }).repos?.length ?? 0} repo(s)</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {showCreate && <CreateModal onCreated={p => { setProjects(prev => [p, ...prev]); setShowCreate(false); }} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
