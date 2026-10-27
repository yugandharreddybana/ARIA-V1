'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import { api, ApiError } from '@/lib/api';
import { parseMonthlyBudget } from '@aria/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { ThemeToggle } from '@/components/theme-toggle';
import { Table, TBody, TD, TR } from '@/components/ui/table';

interface Guard {
  defaultBranch: string;
  protected: boolean;
  acknowledgedAt: string | null;
  pushTokenConfigured: boolean;
  codeRuntime: string;
}
interface Budget { limit: number; used: number; reserved: number; warnAt: number; projectLimit: number | null }
interface Catalog { catalog?: string[]; planningModel: string; developmentModel: string }

export default function SettingsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [guard, setGuard] = useState<Guard | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<{ projects: Array<{ id: string; name: string }> }>('/projects')
      .then((data) => {
        setProjects(data.projects);
        setProjectId((current) => current || data.projects[0]?.id || '');
      })
      .catch(() => setError('Could not load projects.'));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setError('');
    Promise.all([
      api<Guard>(`/projects/${projectId}/github-guard`),
      api<Budget>(`/projects/${projectId}/budget`),
      api<{ modelTiers: Catalog }>(`/projects/${projectId}/company`).catch(() => null),
    ]).then(([nextGuard, nextBudget, company]) => {
      setGuard(nextGuard);
      setBudget(nextBudget);
      setBudgetInput(nextBudget.projectLimit == null ? '' : String(nextBudget.projectLimit));
      setCatalog(company?.modelTiers ?? null);
    }).catch(() => setError('Could not load project settings.'));
  }, [projectId]);

  async function saveRuntime(codeRuntime: 'cursor_cloud' | 'local_worktree') {
    setNotice('');
    try {
      await api(`/projects/${projectId}/settings`, { method: 'PATCH', body: JSON.stringify({ codeRuntime }) });
      setGuard((current) => current ? { ...current, codeRuntime } : current);
      setNotice('Runtime saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the runtime.');
    }
  }

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault();
    setNotice('');
    const parsed = parseMonthlyBudget(budgetInput);
    if (!parsed.ok) {
      setError('Enter a positive whole number, such as 1000 or 1,000. Leave the field empty to use the workspace default.');
      return;
    }
    try {
      await api(`/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ tokenBudgetMonthly: parsed.value }),
      });
      const next = await api<Budget>(`/projects/${projectId}/budget`);
      setBudget(next);
      setNotice(parsed.value == null ? 'Budget cleared. The workspace default applies.' : 'Budget saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the budget.');
    }
  }

  async function acknowledge() {
    setNotice('');
    try {
      await api(`/projects/${projectId}/github-guard/ack`, { method: 'POST' });
      const next = await api<Guard>(`/projects/${projectId}/github-guard`);
      setGuard(next);
      setNotice('Unprotected branch acknowledged.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not acknowledge the branch.');
    }
  }

  const blocked = guard != null && !guard.protected && !guard.acknowledgedAt;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader title="Settings" description="Your account, the colour theme, and a few tools that are not on the main menu." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TBody>
              <TR>
                <TD className="text-muted-foreground">Name</TD>
                <TD data-testid="user-name">{user?.name ?? '—'}</TD>
              </TR>
              <TR>
                <TD className="text-muted-foreground">Email</TD>
                <TD data-testid="user-email">{user?.email ?? '—'}</TD>
              </TR>
              <TR>
                <TD className="text-muted-foreground">GitHub</TD>
                <TD>{user?.githubLogin ? `@${user.githubLogin}` : 'Not connected'}</TD>
              </TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {projects.length === 0 && <p className="text-sm text-muted-foreground">Create a project before changing guard, runtime, or budget.</p>}
          {projects.length > 0 && (
            <label className="block space-y-1.5 text-sm">
              <span>Project</span>
              <select className="field" aria-label="Settings project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          )}
          {guard && (
            <div className="space-y-2 text-sm" data-testid="github-guard">
              <p>Default branch {guard.defaultBranch} is {guard.protected ? 'protected' : 'not protected'}.</p>
              {guard.acknowledgedAt && <p>Unprotected branch acknowledged {new Date(guard.acknowledgedAt).toLocaleString()}.</p>}
              {blocked && <p role="alert">Coding runs are blocked until the default branch is protected or you acknowledge the risk.</p>}
              {!guard.protected && <Button type="button" variant="outline" data-testid="ack-guard" onClick={() => void acknowledge()}>I accept an unprotected branch</Button>}
              <p>Push token: {guard.pushTokenConfigured ? 'configured' : 'not configured'}. Local fallback stays off until a push token is stored.</p>
              <label className="block space-y-1.5">
                <span>Code runtime</span>
                <select
                  className="field"
                  aria-label="Code runtime"
                  value={guard.codeRuntime}
                  onChange={(event) => void saveRuntime(event.target.value === 'local_worktree' ? 'local_worktree' : 'cursor_cloud')}
                >
                  <option value="cursor_cloud">Cursor cloud</option>
                  <option value="local_worktree" disabled={!guard.pushTokenConfigured}>Local fallback</option>
                </select>
              </label>
            </div>
          )}
          {budget && (
            <form onSubmit={saveBudget} className="space-y-2 text-sm">
              <p data-testid="settings-budget">Month to date: {budget.used.toLocaleString()} used, {budget.reserved.toLocaleString()} reserved, limit {budget.limit.toLocaleString()}. Warning at {budget.warnAt.toLocaleString()}.</p>
              <Label htmlFor="monthly-budget">Monthly token budget</Label>
              <Input id="monthly-budget" inputMode="numeric" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} placeholder="Empty uses the workspace default" />
              <Button type="submit" variant="outline">Save budget</Button>
            </form>
          )}
          {catalog && (
            <p className="text-sm" data-testid="settings-catalog">
              Planning {catalog.planningModel}. Development {catalog.developmentModel}. Catalog: {catalog.catalog?.length ? catalog.catalog.join(', ') : 'none stored'}.
            </p>
          )}
          {notice && <p role="status" className="text-sm">{notice}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Light is the default. Dark mode stays on this browser.</p>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">More</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-primary" href="/ai">Assistant</Link></li>
            <li><Link className="text-primary" href="/system-health">System health</Link></li>
            <li><Link className="text-primary" href="/planning">Ideas</Link></li>
            <li><Link className="text-primary" href="/dashboard/team">Skills</Link></li>
            <li><Link className="text-primary" href="/setup">Continue setup</Link></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
