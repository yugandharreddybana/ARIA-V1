'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { rememberProject } from '@/lib/project-selection';
import type { Project, ProjectRepo, AnalysisJob } from '@aria/shared';

type ProjectWithRepos = Project & { repos: ProjectRepo[] };

const STATUS_CONFIG = {
  queued:  { label: 'Queued',   color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
  running: { label: 'Running',  color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
  done:    { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  failed:  { label: 'Failed',   color: 'text-destructive', bg: 'bg-destructive/10' },
} as const;


function ConnectRepoModal({ projectId, onConnected, onClose }: {
  projectId: string;
  onConnected: (r: ProjectRepo) => void;
  onClose: () => void;
}) {
  const [repoUrl, setRepoUrl] = useState('');
  const [branch,  setBranch]  = useState('main');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

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
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : 'Failed to connect repo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title="Connect repository" description="Paste the GitHub URL ARIA should read.">
        <form onSubmit={submit} className="space-y-4">
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="repoUrl">GitHub repository URL</Label>
            <Input id="repoUrl" value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch">Branch</Label>
            <Input id="branch" value={branch} onChange={e => setBranch(e.target.value)}
              placeholder="main" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Connecting…' : 'Connect'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [project,      setProject]      = useState<ProjectWithRepos | null>(null);
  const [jobs,         setJobs]         = useState<AnalysisJob[]>([]);
  const [loadingPage,  setLoadingPage]  = useState(true);
  const [showConnect,  setShowConnect]  = useState(false);
  const [analyzingId,  setAnalyzingId]  = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const projectRes = await api<{ project: ProjectWithRepos }>(`/projects/${id}`);
      setProject(projectRes.project);
      rememberProject(id);
      try {
        const jobsRes = await api<{ jobs: AnalysisJob[] }>(`/analysis/jobs`);
        setJobs(jobsRes.jobs.filter(j => j.projectId === id));
        setJobsError(null);
      } catch (e: unknown) {
        setJobsError(e instanceof ApiError ? e.message : 'Could not load analysis jobs.');
      }
    } catch {
      router.push('/projects');
    } finally {
      setLoadingPage(false);
    }
  }, [id, router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConnected = (repo: ProjectRepo) => {
    setProject(prev => prev ? { ...prev, repos: [...prev.repos, repo] } : prev);
    setShowConnect(false);
  };

  const triggerAnalysis = async (repoId: string) => {
    setAnalyzingId(repoId);
    setAnalyzeError(null);
    try {
      const d = await api<AnalysisJob>(`/projects/${id}/repos/${repoId}/analyze`, { method: 'POST' });
      setJobs(prev => [d, ...prev]);
      router.push(`/projects/${id}/jobs/${d.jobId}`);
    } catch (e: unknown) {
      // Show a visible inline error — user needs to know the trigger failed
      setAnalyzeError(e instanceof ApiError ? e.message : 'Failed to trigger analysis. Please try again.');
    } finally {
      setAnalyzingId(null);
    }
  };

  if (loadingPage) return <LoadingState label="Loading project…" />;
  if (!project) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <button
        onClick={() => router.push('/projects')}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Back to projects
      </button>

      <PageHeader
        title={project.name}
        description={project.description || 'Connect a repository, then open the company or the board.'}
        action={<Button onClick={() => setShowConnect(true)}>Connect Repo</Button>}
      />
      <Badge tone={project.status === 'active' ? 'accent' : 'neutral'}>{project.status}</Badge>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link className="text-primary" href={`/projects/${id}/company`}>Org chart</Link>
        <Link className="text-primary" href={`/projects/${id}/knowledge`}>Knowledge map</Link>
        <Link className="text-primary" href={`/projects/${id}/graph`}>Concept graph</Link>
        <Link className="text-primary" href="/board">Board</Link>
      </p>

      {/* Inline error for failed analysis trigger */}
      {analyzeError && <p role="alert" className="text-sm text-destructive">{analyzeError}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Connected repositories</h2>
        {project.repos.length === 0 ? (
          <EmptyState
            title="No repositories connected yet"
            description="Connect the GitHub repository this project should understand."
            action={<Button variant="outline" onClick={() => setShowConnect(true)}>Connect a repo</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR><TH>Repository</TH><TH>Branch</TH><TH>Action</TH></TR>
            </THead>
            <TBody>
              {project.repos.map(repo => (
                <TR key={repo.id}>
                  <TD>
                    <p className="font-medium">{repo.repoName}</p>
                    <a href={repo.repoUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground">{repo.repoUrl}</a>
                  </TD>
                  <TD>{repo.branch}</TD>
                  <TD>
                    <Button size="sm" variant="outline" onClick={() => triggerAnalysis(repo.id)} disabled={analyzingId === repo.id}>
                      {analyzingId === repo.id ? 'Starting…' : 'Analyze'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Analysis Jobs</h2>
        {jobsError ? <ErrorNote>{jobsError}</ErrorNote> : jobs.length === 0 ? (
          <EmptyState title="No analysis jobs yet" description="Run analysis on a connected repository to see jobs here." />
        ) : (
          <Table>
            <THead>
              <TR><TH>Repository</TH><TH>Branch</TH><TH>Status</TH><TH>Started</TH></TR>
            </THead>
            <TBody>
              {jobs.map(job => {
                const cfg = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.queued;
                return (
                  <TR key={job.jobId}>
                    <TD><Link href={`/projects/${id}/jobs/${job.jobId}`} className="font-medium text-primary">{job.repoUrl.split('/').slice(-2).join('/')}</Link></TD>
                    <TD>{job.branch}</TD>
                    <TD>{cfg.label}</TD>
                    <TD>{new Date(job.createdAt).toLocaleString()}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      {showConnect && (
        <ConnectRepoModal
          projectId={id}
          onConnected={handleConnected}
          onClose={() => setShowConnect(false)}
        />
      )}
    </div>
  );
}
