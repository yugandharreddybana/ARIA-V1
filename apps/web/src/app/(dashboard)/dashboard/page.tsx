'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderOpen, Github, Zap, Loader2, AlertCircle } from 'lucide-react';
import type { Project } from '@aria/shared';
import type { AnalysisJobResponse } from '@/types/backend';

interface DashboardStats {
  projectCount: number;
  repoCount: number;
  lastJobStatus: string | null;
  lastJobUpdatedAt: string | null;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [projectsData, jobsData] = await Promise.allSettled([
          api<{ projects: (Project & { repos: unknown[] })[] }>('/projects'),
          api<{ jobs: AnalysisJobResponse[] }>('/analysis/jobs'),
        ]);

        const projects = projectsData.status === 'fulfilled' ? projectsData.value.projects : [];
        const jobs = jobsData.status === 'fulfilled' ? jobsData.value.jobs : [];

        const repoCount = projects.reduce((sum, p) => sum + (p.repos?.length ?? 0), 0);
        const latestJob = jobs[0] ?? null;

        setStats({
          projectCount: projects.length,
          repoCount,
          lastJobStatus: latestJob?.status ?? null,
          lastJobUpdatedAt: latestJob?.updatedAt ?? null,
        });
      } catch {
        setError('Failed to load dashboard data');
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

  const statusColor = (s: string | null) => {
    if (!s) return 'text-muted-foreground';
    if (s === 'done') return 'text-emerald-500';
    if (s === 'failed') return 'text-destructive';
    if (s === 'running') return 'text-blue-400';
    return 'text-yellow-400';
  };

  const lastAnalysis = stats?.lastJobStatus
    ? `Status: ${stats.lastJobStatus}${stats.lastJobUpdatedAt ? ' · ' + new Date(stats.lastJobUpdatedAt).toLocaleString() : ''}`
    : 'No analysis run yet';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Workspace overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={FolderOpen} label="Projects" value={stats?.projectCount ?? 0} sub="Total in workspace" />
        <StatCard icon={Github} label="Repos Connected" value={stats?.repoCount ?? 0} sub="Across all projects" />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Analysis</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold capitalize ${statusColor(stats?.lastJobStatus ?? null)}`}>
              {stats?.lastJobStatus ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{lastAnalysis}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
