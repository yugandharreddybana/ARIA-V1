'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import type { Project } from '@aria/shared';

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
      const d = await api<{ project: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }),
      });
      onCreated(d.project);
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title="New project" description="A project is one product and, later, one company.">
        <form onSubmit={submit} className="space-y-4">
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="pname">Name</Label>
            <Input id="pname" name="name" value={name} onChange={e => setName(e.target.value)} placeholder="My Platform" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdesc">Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input id="pdesc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this project?" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects')
      .then(d => setProjects(d.projects))
      .catch(() => setError('Failed to load projects. Please refresh the page.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Projects"
        description="Each project is one product. Set it up to connect a repository and generate a company."
        action={(
          <>
            <Link href="/setup"><Button variant="outline" data-testid="start-setup">Set up a company</Button></Link>
            <Button onClick={() => setShowCreate(true)}>New Project</Button>
          </>
        )}
      />
      {loading && <LoadingState label="Loading projects…" />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!loading && !error && projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Use New Project for a blank project, or Set up a company to connect a repository."
        />
      )}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card data-testid="project-card" className="h-full hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Badge tone={p.status === 'active' ? 'accent' : 'neutral'}>{p.status}</Badge>
                  </div>
                  {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{(p as { repos?: unknown[] }).repos?.length ?? 0} repositories</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {showCreate && (
        <CreateModal
          onCreated={p => { setProjects(prev => [p, ...prev]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
