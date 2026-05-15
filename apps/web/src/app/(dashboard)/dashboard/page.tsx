'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FolderOpen, Github, Zap, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, BrainCircuit,
  ArrowRight, Plus, Activity,
} from 'lucide-react';
import type { Project, AnalysisJob } from '@aria/shared';

type ProjectWithRepos = Project & { repos: { id: string }[] };

const JOB_STATUS_CFG = {
  queued:  { label: 'Queued',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    Icon: Clock        },
  running: { label: 'Running',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   Icon: Loader2      },
  done:    { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: CheckCircle2 },
  failed:  { label: 'Failed',   color: 'text-destructive', bg: 'bg-destructive/10', Icon: XCircle      },
} as const;

function StatCard({
  icon: Icon, label, value, sub, href, iconColor,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; href?: string; iconColor?: string;
}) {
  const inner = (
    <Card className={href ? 'hover:border-aria-500/40 transition-colors cursor-pointer' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor ?? 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithRepos[]>([]);
  const [jobs,     setJobs]     = useState<AnalysisJob[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Promise.allSettled never throws — check each result individually
        const [pRes, jRes] = await Promise.allSettled([
          api<{ projects: ProjectWithRepos[] }>('/projects'),
          api<{ jobs: AnalysisJob[] }>('/analysis/jobs'),
        ]);

        if (pRes.status === 'fulfilled') {
          setProjects(pRes.value.projects);
        } else {
          // Projects failing is critical — show error
          setError('Failed to load projects. Please refresh.');
        }

        if (jRes.status === 'fulfilled') {
          setJobs(jRes.value.jobs);
        }
        // Jobs failing is non-critical — dashboard still usable without activity feed
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-destructive p-6">
      <AlertCircle className="h-5 w-5" />
      <span className="text-sm">{error}</span>
    </div>
  );

  const repoCount     = projects.reduce((s, p) => s + (p.repos?.length ?? 0), 0);
  const runningJobs   = jobs.filter(j => j.status === 'running').length;
  const completedJobs = jobs.filter(j => j.status === 'done').length;
  const recentJobs    = [...jobs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (projects.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome to ARIA — let&apos;s set up your first project.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-5 border border-dashed border-border rounded-xl">
          <div className="p-4 rounded-full bg-aria-900/40">
            <BrainCircuit className="h-10 w-10 text-aria-400" />
          </div>
          <div>
            <p className="font-semibold text-lg">Your workspace is empty</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first project, connect a GitHub repo, and run AI analysis to generate your concept graph.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/projects">
              <Button variant="aria">
                <Plus className="h-4 w-4 mr-2" /> Create First Project
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 w-full max-w-lg text-left">
            {[
              { step: '1', title: 'Create a project', desc: 'Group your repos into a project workspace' },
              { step: '2', title: 'Connect a repo',   desc: 'Link your GitHub repository to the project' },
              { step: '3', title: 'Run analysis',     desc: 'Generate your AI-powered concept graph' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="p-3 rounded-lg bg-card border border-border/50">
                <div className="text-xs font-bold text-aria-400 mb-1">Step {step}</div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted-foreground mt-1">Here&apos;s your workspace at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FolderOpen}   label="Projects"     value={projects.length} sub="in workspace"                       href="/projects" iconColor="text-aria-400" />
        <StatCard icon={Github}       label="Repos"        value={repoCount}       sub="connected"                                         iconColor="text-slate-400" />
        <StatCard icon={Activity}     label="Running Jobs" value={runningJobs}     sub={runningJobs > 0 ? 'analysis in progress' : 'all quiet'} iconColor={runningJobs > 0 ? 'text-amber-400' : 'text-muted-foreground'} />
        <StatCard icon={CheckCircle2} label="Completed"    value={completedJobs}   sub="analyses done"                                      iconColor="text-emerald-400" />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent Projects</h2>
          <Link href="/projects" className="flex items-center gap-1 text-xs text-aria-400 hover:text-aria-300 transition-colors">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.slice(0, 3).map(p => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-aria-500/40 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                      p.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                    }`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {p.repos?.length ?? 0} repo{(p.repos?.length ?? 0) !== 1 ? 's' : ''} connected
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Recent Analysis Jobs</h2>
          <span className="text-xs text-muted-foreground">{jobs.length} total</span>
        </div>

        {recentJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2 border border-dashed border-border rounded-lg">
            <Zap className="h-8 w-8 opacity-30" />
            <p className="text-sm">No analysis jobs yet</p>
            <p className="text-xs">Open a project, connect a repo, and hit Analyze</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentJobs.map(job => {
              const cfg = JOB_STATUS_CFG[job.status as keyof typeof JOB_STATUS_CFG] ?? JOB_STATUS_CFG.queued;
              const { Icon } = cfg;
              return (
                <Link key={job.jobId} href={`/projects/${job.projectId}/jobs/${job.jobId}`}>
                  <Card className="hover:border-aria-500/40 transition-colors cursor-pointer">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-md ${cfg.bg}`}>
                          <Icon className={`h-3.5 w-3.5 ${cfg.color} ${job.status === 'running' ? 'animate-spin' : ''}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {job.repoUrl.split('/').slice(-2).join('/')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Branch: <span className="font-mono">{job.branch}</span>
                            <span className="mx-1.5">&middot;</span>
                            {new Date(job.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
