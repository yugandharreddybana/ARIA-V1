'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ProviderCredentialsPanel } from '@/components/providers/provider-credentials-panel';
import { cn } from '@/lib/utils';

interface RepoRow { fullName: string; private: boolean; defaultBranch: string }
interface FlowRow { id: string; name: string; kind: string; description: string }
interface JobRow { id: string; status: string; errorMessage: string | null }
interface SetupState {
  project: { id: string; name: string } | null;
  llmConfigured: boolean;
  credentialsReady?: { ok: boolean };
  repoCount: number;
  knowledgeReady: boolean;
  summary: string;
  flows: FlowRow[];
  jobs: JobRow[];
  knowledge?: { enrichment?: 'pending' | 'ai' | 'template' };
}

const EMPTY_MIX = { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 1, aiml: 0, devops: 0, security: 0 };

const STEP_LABELS = ['Project', 'Model', 'GitHub', 'Knowledge', 'Company'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-x-4 gap-y-2" aria-label="Setup steps">
      {STEP_LABELS.map((label, index) => {
        const number = index + 1;
        const current = number === step;
        const done = number < step;
        return (
          <li key={label} className="flex items-center gap-2 text-sm" aria-current={current ? 'step' : undefined}>
            <span className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
              current && 'border-primary bg-primary text-primary-foreground',
              done && 'border-primary text-primary',
              !current && !done && 'border-border text-muted-foreground',
            )}>
              {number}
            </span>
            <span className={current ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [providersReady, setProvidersReady] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [summary, setSummary] = useState('');
  const [enrichment, setEnrichment] = useState<'pending' | 'ai' | 'template'>('pending');
  const [size, setSize] = useState(10);
  const [mix, setMix] = useState(EMPTY_MIX);
  const [planningTier, setPlanningTier] = useState<'top' | 'auto'>('top');
  const [developmentTier, setDevelopmentTier] = useState<'top' | 'auto'>('auto');
  const [busy, setBusy] = useState(false);
  const resumed = useRef(false);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await api<{ project: { id: string } }>('/setup/project', {
        method: 'POST',
        body: JSON.stringify({ name: projectName }),
      });
      resumed.current = true;
      setProjectId(data.project.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the project');
    } finally { setBusy(false); }
  }

  async function continueAfterProviders() {
    setBusy(true); setError('');
    try {
      await api('/setup/complete', { method: 'POST' });
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Activate planning and coding credentials first');
    } finally { setBusy(false); }
  }

  async function listRepos() {
    setBusy(true); setError('');
    try {
      await api('/github/token', { method: 'POST', body: JSON.stringify({ token: githubToken }) });
      const data = await api<{ repos: RepoRow[] }>('/github/repos');
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not list repositories');
    } finally { setBusy(false); }
  }

  async function connectRepos() {
    setBusy(true); setError('');
    try {
      const chosen = repos.filter((repo) => selected.includes(repo.fullName));
      await api('/setup/repos', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          repos: chosen.map((repo) => ({ fullName: repo.fullName, branch: repo.defaultBranch || 'main' })),
        }),
      });
      setStep(4);
      await pollKnowledge(projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect repositories');
    } finally { setBusy(false); }
  }

  async function pollKnowledge(id: string) {
    for (let attempt = 0; attempt < 45; attempt++) {
      const data = await api<{ map: { summary: string; source?: string } | null; flows: FlowRow[]; jobs: JobRow[] }>(`/projects/${id}/knowledge`);
      const active = data.jobs.some((job) => job.status === 'queued' || job.status === 'running');
      const failed = data.jobs.find((job) => job.status === 'failed');
      setEnrichment(active ? 'pending' : data.map?.source === 'ai' ? 'ai' : 'template');
      if (data.map && !active) {
        setSummary(data.map.summary);
        setFlows(data.flows);
        setError('');
        return;
      }
      if (failed && !active) {
        setError(failed.errorMessage || 'Analysis failed. Connect the repository again to retry.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setError('Analysis is still running. Leave this page and come back — setup resumes where you left off.');
  }

  useEffect(() => {
    api<SetupState>('/setup/state').then((state) => {
      if (resumed.current || !state.project) return;
      resumed.current = true;
      setProjectId(state.project.id);
      setProjectName(state.project.name);
      if (state.knowledge?.enrichment) setEnrichment(state.knowledge.enrichment);
      if (state.knowledgeReady) {
        setSummary(state.summary);
        setFlows(state.flows);
        setStep(4);
        return;
      }
      if (state.repoCount > 0) {
        setStep(4);
        void pollKnowledge(state.project.id);
        return;
      }
      setStep(state.llmConfigured ? 3 : 2);
    }).catch(() => undefined);
  }, []);

  async function generateCompany(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/projects/${projectId}/company`, {
        method: 'POST',
        body: JSON.stringify({ size, mix, modelTiers: { planning: planningTier, development: developmentTier } }),
      });
      setStep(5);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the company');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <PageHeader
        title="Set up your company"
        description="One step at a time. You can leave and come back — setup resumes where you stopped."
      />
      <div className="mt-6">
        <Stepper step={step} />
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Create a project</CardTitle>
            <CardDescription>One product, one company.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createProject} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="project-name">Project name</Label>
                <Input id="project-name" data-testid="setup-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
              </div>
              <Button type="submit" variant="aria" disabled={busy || projectName.trim().length < 2}>Continue</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Connect providers</CardTitle>
            <CardDescription>
              No product default. Test Connection must succeed, then activate planning and coding. Coding lists only canCode agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProviderCredentialsPanel
              mode="setup"
              projectId={projectId || undefined}
              onReadyChange={setProvidersReady}
            />
            <Button
              type="button"
              variant="aria"
              data-testid="setup-next"
              disabled={!providersReady || busy}
              onClick={() => void continueAfterProviders()}
            >
              Next
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Connect GitHub</CardTitle>
            <CardDescription>The token is encrypted before it is stored. It is not shown again.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="github-token">Personal access token</Label>
              <Input id="github-token" data-testid="github-token" type="password" autoComplete="off" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} />
            </div>
            <Button type="button" variant="outline" data-testid="list-repos" onClick={listRepos} disabled={busy || githubToken.length < 8}>List repositories</Button>
            <ul className="space-y-2">
              {repos.map((repo) => (
                <li key={repo.fullName}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid={`repo-${repo.fullName.replace(/[^a-z0-9]+/gi, '-')}`}
                      checked={selected.includes(repo.fullName)}
                      onChange={() => setSelected((current) => current.includes(repo.fullName) ? current.filter((name) => name !== repo.fullName) : [...current, repo.fullName])}
                    />
                    {repo.fullName}
                  </label>
                </li>
              ))}
            </ul>
            <Button type="button" variant="aria" data-testid="connect-repos" disabled={!selected.length || busy} onClick={connectRepos}>Connect and analyze</Button>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Knowledge map</CardTitle>
            <CardDescription>Flows found in the repository. Generate a company that can own them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p data-testid="knowledge-summary" className="text-sm">{summary || 'Reading the repository…'}</p>
            <p data-testid="enrichment-status" className="text-sm text-muted-foreground">AI enrichment: {enrichment}. You can continue with the template company while a planning run is still going.</p>
            <ul className="space-y-2">
              {flows.map((flow) => (
                <li key={flow.id} data-testid="knowledge-flow" className="text-sm border border-border rounded-md p-2">
                  <span className="font-medium">{flow.name}</span>
                  <span className="text-muted-foreground"> · {flow.kind}</span>
                  <p>{flow.description}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={generateCompany} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="company-size">Company size</Label>
                <Input id="company-size" data-testid="company-size" type="number" min={3} max={40} value={size} onChange={(event) => setSize(Number(event.target.value))} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.keys(mix) as Array<keyof typeof mix>).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`mix-${key}`}>{key}</Label>
                    <Input id={`mix-${key}`} data-testid={`mix-${key}`} type="number" min={0} max={40} value={mix[key]} onChange={(event) => setMix({ ...mix, [key]: Number(event.target.value) })} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="planning-tier">Planning model</Label>
                  <select
                    id="planning-tier"
                    data-testid="tier-planning"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={planningTier}
                    onChange={(event) => setPlanningTier(event.target.value === 'auto' ? 'auto' : 'top')}
                  >
                    <option value="top">Top tier</option>
                    <option value="auto">Auto / standard</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="development-tier">Development model</Label>
                  <select
                    id="development-tier"
                    data-testid="tier-development"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={developmentTier}
                    onChange={(event) => setDevelopmentTier(event.target.value === 'top' ? 'top' : 'auto')}
                  >
                    <option value="auto">Auto / standard</option>
                    <option value="top">Top tier</option>
                  </select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Planning covers the knowledge map, company generation, architecture, and security review. Development covers coding, tests, fixes, and docs. Cursor planning uses a top-tier model. Cursor development uses Auto. You can change either tier later on the org chart.
              </p>
              <Button type="submit" variant="aria" data-testid="generate-company" disabled={busy || !summary}>Generate company</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Company is ready</CardTitle>
            <CardDescription>Open the org chart to edit roles, add people, or turn agents off. A generation run keeps going in the queue and does not block the chart.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href={`/projects/${projectId}/company`} data-testid="open-org-chart">
              <Button variant="aria">Open org chart</Button>
            </Link>
            <Link href={`/projects/${projectId}/knowledge`}>
              <Button variant="outline">View knowledge map</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
