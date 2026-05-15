'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth.context';
import { api, type Project } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FolderGit2, GitBranch, Zap, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: Project[] }>('/api/projects')
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeCount = projects.filter(p => p.status === 'active').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening across your workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <p className="text-3xl font-bold">{projects.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{activeCount} active</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Repositories</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Connect repos to track</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Analysis Jobs</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">—</p>
            <p className="text-xs text-muted-foreground mt-1">Available in Sprint 3</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Projects</h2>
          <Link href="/projects"><Button variant="ghost" size="sm">View all <ArrowRight className="h-4 w-4 ml-1" /></Button></Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 gap-3">
            <FolderGit2 className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No projects yet.</p>
            <Link href="/projects"><Button variant="aria" size="sm"><FolderGit2 className="h-4 w-4 mr-2" />Create First Project</Button></Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="hover:border-aria-500/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{p.name}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground line-clamp-2">{p.description ?? 'No description'}</p></CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
