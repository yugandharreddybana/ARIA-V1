'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project, ProjectRepo } from '@aria/shared';
import { Github, Loader2, Plus, Trash2, ArrowLeft, GitBranch, Zap } from 'lucide-react';

type ProjectWithRepos = Project & { repos: ProjectRepo[] };

function ConnectRepoModal({ projectId, onConnected, onClose }: { projectId: string; onConnected: (r: ProjectRepo) => void; onClose: () => void }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) { setErr('Repository URL is required'); return; }
    setLoading(true); setErr('');
    try {
      const d = await api<{ repo: ProjectRepo }>(`/projects/${projectId}/repos`, {
        method: 'POST',
        body: JSON.stringify({ repoUrl: repoUrl.trim(), branch: branch.trim() || 'main' }),
      });
      onConnected(d.repo);
    } catch (e: unknown) { setErr(e instanceof ApiError ? e.message : 'Failed to connect repo'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Repository</CardTitle>
          <CardDescription>Link a GitHub repository to this project</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="repoUrl">GitHub Repository URL</Label>
              <Input id="repoUrl" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Input id="branch" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="aria" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectWithRepos | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyzeStatus, setAnalyzeStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    api<{ project: ProjectWithRepos }>(`/projects/${id}`)
      .then(d => setProject(d.project))
      .catch(() => router.push('/projects'))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleConnected = (repo: ProjectRepo) => {
    setProject(prev => prev ? { ...prev, repos: [...prev.repos, repo] } : prev);
    setShowConnect(false);
  };

  const triggerAnalysis = async (repoId: string) => {
    setAnalyzingId(repoId);
    try {
      const d = await api<{ jobId: string; status: string }>(`/projects/${id}/repos/${repoId}/analyze`, { method: 'POST' });
      setAnalyzeStatus(prev => ({ ...prev, [repoId]: d.status }));
    } catch {
      setAnalyzeStatus(prev => ({ ...prev, [repoId]: 'failed' }));
    } finally { setAnalyzingId(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!project) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => router.push('/projects')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-muted-foreground text-sm mt-1">{project.description}</p>}
          <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${project.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{project.status}</span>
        </div>
        <Button variant="aria" onClick={() => setShowConnect(true)}><Plus className="h-4 w-4 mr-2" />Connect Repo</Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Connected Repositories</h2>
        {project.repos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
            <Github className="h-10 w-10 opacity-30" />
            <p>No repositories connected yet</p>
            <Button variant="outline" size="sm" onClick={() => setShowConnect(true)}><Plus className="h-4 w-4 mr-2" />Connect a repo</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {project.repos.map(repo => (
              <Card key={repo.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Github className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{repo.repoName}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <GitBranch className="h-3 w-3" />
                        <span>{repo.branch}</span>
                        <span className="mx-1">&middot;</span>
                        <a href={repo.repoUrl} target="_blank" rel="noreferrer" className="hover:text-foreground truncate max-w-xs">{repo.repoUrl}</a>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {analyzeStatus[repo.id] && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        analyzeStatus[repo.id] === 'queued' ? 'bg-blue-500/10 text-blue-400' :
                        analyzeStatus[repo.id] === 'failed' ? 'bg-destructive/10 text-destructive' :
                        'bg-muted text-muted-foreground'
                      }`}>{analyzeStatus[repo.id]}</span>
                    )}
                    <Button
                      size="sm" variant="outline"
                      onClick={() => triggerAnalysis(repo.id)}
                      disabled={analyzingId === repo.id}
                    >
                      {analyzingId === repo.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Zap className="h-3.5 w-3.5 mr-1.5" />Analyze</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showConnect && <ConnectRepoModal projectId={id} onConnected={handleConnected} onClose={() => setShowConnect(false)} />}
    </div>
  );
}
