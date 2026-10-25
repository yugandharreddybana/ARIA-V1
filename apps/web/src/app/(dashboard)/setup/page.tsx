'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ProviderId = 'cursor' | 'gemini' | 'groq' | 'ollama' | 'openai' | 'anthropic' | 'openai_compatible';

const PROVIDERS: Array<{ id: ProviderId; label: string; model: string; baseUrl?: string; needsKey: boolean; hint: string }> = [
  { id: 'cursor', label: 'Cursor', model: 'cursor-agent', baseUrl: 'https://api.cursor.com', needsKey: true, hint: 'Default. Verifies a Cloud Agents API key. Cursor cannot complete chat prompts.' },
  { id: 'gemini', label: 'Gemini', model: 'gemini-2.0-flash', needsKey: true, hint: 'Google AI Studio key.' },
  { id: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile', needsKey: true, hint: 'OpenAI-compatible Groq key.' },
  { id: 'ollama', label: 'Ollama', model: 'qwen2.5-coder:7b', baseUrl: 'http://localhost:11434', needsKey: false, hint: 'Local Ollama server.' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4o-mini', needsKey: true, hint: 'OpenAI API key.' },
  { id: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5', needsKey: true, hint: 'Anthropic API key.' },
  { id: 'openai_compatible', label: 'OpenAI-compatible', model: 'local-model', baseUrl: 'http://localhost:8080/v1', needsKey: true, hint: 'Any base URL that serves /v1/models and /v1/chat/completions.' },
];

interface RepoRow { fullName: string; private: boolean; defaultBranch: string }
interface FlowRow { id: string; name: string; kind: string; description: string }

const EMPTY_MIX = { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 1, aiml: 0, devops: 0, security: 0 };

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [provider, setProvider] = useState<ProviderId>('cursor');
  const [model, setModel] = useState(PROVIDERS[0].model);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [tested, setTested] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [summary, setSummary] = useState('');
  const [size, setSize] = useState(10);
  const [mix, setMix] = useState(EMPTY_MIX);
  const [planningTier, setPlanningTier] = useState<'top' | 'auto'>('top');
  const [developmentTier, setDevelopmentTier] = useState<'top' | 'auto'>('auto');
  const [busy, setBusy] = useState(false);

  const preset = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];

  function chooseProvider(id: ProviderId) {
    const next = PROVIDERS.find((item) => item.id === id) ?? PROVIDERS[0];
    setProvider(id);
    setModel(next.model);
    setBaseUrl(next.baseUrl ?? '');
    setTested(false);
    setTestMessage('');
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await api<{ project: { id: string } }>('/setup/project', {
        method: 'POST',
        body: JSON.stringify({ name: projectName }),
      });
      setProjectId(data.project.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the project');
    } finally { setBusy(false); }
  }

  async function testConnection() {
    setBusy(true); setError(''); setTested(false);
    try {
      const result = await api<{ ok: boolean; message: string }>('/workspace/llm-config/test', {
        method: 'POST',
        body: JSON.stringify({ provider, model, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
      });
      setTestMessage(result.message);
      setTested(result.ok);
    } catch (err) {
      setTested(false);
      setTestMessage(err instanceof ApiError ? err.message : 'Connection failed');
    } finally { setBusy(false); }
  }

  async function saveProvider(event: React.FormEvent) {
    event.preventDefault();
    if (!tested) return;
    setBusy(true); setError('');
    try {
      await api('/workspace/llm-config', {
        method: 'PATCH',
        body: JSON.stringify({ provider, model, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined }),
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the provider');
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
      await pollKnowledge();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect repositories');
    } finally { setBusy(false); }
  }

  async function pollKnowledge() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const data = await api<{ map: { summary: string } | null; flows: FlowRow[] }>(`/projects/${projectId}/knowledge`);
      if (data.map) {
        setSummary(data.map.summary);
        setFlows(data.flows);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setError('Analysis is still queued. Refresh the knowledge page in a moment.');
  }

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
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Set up your company</h1>
      <p className="text-sm text-muted-foreground mb-6">Project, model, repository, knowledge map, then the org chart.</p>
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
            <CardTitle>Choose a model provider</CardTitle>
            <CardDescription>Cursor is the default. Test Connection must succeed before you continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProvider} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PROVIDERS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={provider === item.id ? 'aria' : 'outline'}
                    data-testid={`provider-${item.id}`}
                    onClick={() => chooseProvider(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{preset.hint}</p>
              <div className="space-y-1.5">
                <Label htmlFor="model">Model</Label>
                <Input id="model" data-testid="llm-model" value={model} onChange={(event) => { setModel(event.target.value); setTested(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="base-url">Base URL</Label>
                <Input id="base-url" data-testid="llm-base-url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setTested(false); }} />
              </div>
              {preset.needsKey && (
                <div className="space-y-1.5">
                  <Label htmlFor="api-key">API key</Label>
                  <Input id="api-key" data-testid="llm-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setTested(false); }} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" data-testid="test-connection" onClick={testConnection} disabled={busy}>Test Connection</Button>
                <Button type="submit" variant="aria" data-testid="setup-next" disabled={!tested || busy}>Next</Button>
              </div>
              {testMessage && <p data-testid="test-connection-result" className="text-sm">{testMessage}</p>}
            </form>
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
            <CardDescription>Open the org chart to edit roles, add people, or turn agents off.</CardDescription>
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
