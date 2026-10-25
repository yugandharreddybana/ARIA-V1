'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorNote, LoadingState } from '@/components/ui/empty-state';
import { rememberedProject } from '@/lib/project-selection';

interface ProjectRow { id: string; name: string }

export default function CompanyIndexPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ projects: ProjectRow[] }>('/projects')
      .then((data) => setProjects(data.projects))
      .catch(() => setError('Could not load projects.'))
      .finally(() => setLoading(false));
  }, []);

  const remembered = rememberedProject();
  const ordered = [...projects].sort((a, b) => (a.id === remembered ? -1 : b.id === remembered ? 1 : 0));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Company"
        description="Open a project to see its org chart. You can edit roles, add people, and turn anyone off."
        action={<Link href="/dashboard/team" className="text-sm text-primary">Skills</Link>}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <LoadingState label="Loading projects…" />}
      {!loading && !error && ordered.length === 0 && (
        <EmptyState
          title="No company yet"
          description="Set up a project first. ARIA will propose the people who own it."
          action={<Link href="/setup"><Button>Set up a company</Button></Link>}
        />
      )}
      {!loading && ordered.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {ordered.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">{project.name}</span>
              <Link href={`/projects/${project.id}/company`} className="text-sm text-primary">Open org chart</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
