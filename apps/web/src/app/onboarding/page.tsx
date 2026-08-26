'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BrainCircuit, Loader2, ChevronRight, ChevronLeft, CheckCircle2,
  Github, Building2, Cpu, FolderGit2, Radar, Users, Rocket,
  AlertCircle, Trash2, Pencil, Plus, X,
} from 'lucide-react';
import type {
  OnboardingStatus, GitHubRepoListItem, OnboardingProposal,
  ProposedSkill, SelectedRepo, CommitProposalResponse,
} from '@aria/shared';

const MIDDLEWARE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

type Ok<T> = { ok: boolean; data: T };

const STEPS = [
  { n: 1, label: 'Company',  icon: Building2 },
  { n: 2, label: 'AI Model', icon: Cpu },
  { n: 3, label: 'Repos',    icon: FolderGit2 },
  { n: 4, label: 'Scout',    icon: Radar },
  { n: 5, label: 'Team',     icon: Users },
  { n: 6, label: 'Launch',   icon: Rocket },
] as const;

const LLM_PROVIDERS = [
  { id: 'ollama',    label: 'Ollama (Local)',       requiresApiKey: false, defaultBaseUrl: 'http://localhost:11434', defaultModel: 'qwen2.5-coder:7b' },
  { id: 'anthropic', label: 'Anthropic (Claude)',   requiresApiKey: true,  defaultBaseUrl: '',                       defaultModel: 'claude-sonnet-4-5' },
  { id: 'openai',    label: 'OpenAI',               requiresApiKey: true,  defaultBaseUrl: '',                       defaultModel: 'gpt-4o' },
  { id: 'nvidia',    label: 'NVIDIA NIM',           requiresApiKey: true,  defaultBaseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/nemotron-3-8b-chat-4k' },
  { id: 'custom',    label: 'Custom / Self-hosted', requiresApiKey: false, defaultBaseUrl: 'http://localhost:8000/v1', defaultModel: '' },
] as const;
type LlmProviderId = typeof LLM_PROVIDERS[number]['id'];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [step, setStep]         = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [booting, setBooting]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  // ── Step 1 ──
  const [companyName, setCompanyName]               = useState('');
  const [companyDescription, setCompanyDescription] = useState('');

  // ── Step 2 ──
  const [provider, setProvider] = useState<LlmProviderId>('ollama');
  const [baseUrl, setBaseUrl]   = useState('http://localhost:11434');
  const [model, setModel]       = useState('qwen2.5-coder:7b');
  const [apiKey, setApiKey]     = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);

  // ── Step 3 ──
  const [repos, setRepos]                 = useState<GitHubRepoListItem[]>([]);
  const [reposLoading, setReposLoading]   = useState(false);
  const [reposError, setReposError]       = useState<string | null>(null);
  const [selected, setSelected]           = useState<SelectedRepo[]>([]);
  const [manualUrl, setManualUrl]         = useState('');

  // ── Step 4 ──
  const [scoutName, setScoutName]               = useState('Aria Scout');
  const [scoutDescription, setScoutDescription] = useState(
    'You are the onboarding scout. You analyse the connected repositories and propose the ideal AI engineering team for this codebase.',
  );

  // ── Step 5 ──
  const [proposal, setProposal]       = useState<OnboardingProposal | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [edit, setEdit]               = useState({ realName: '', roleTitle: '', department: '', description: '' });
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill]       = useState({ realName: '', roleTitle: '', department: 'Engineering' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 6 ──
  const [commitResult, setCommitResult] = useState<CommitProposalResponse | null>(null);

  // ── Boot: auth guard + resume point ─────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    (async () => {
      try {
        const { data: status } = await api<Ok<OnboardingStatus>>('/onboarding/status');
        if (status.completed) { router.replace('/dashboard'); return; }
        if (status.companyDescription) setCompanyDescription(status.companyDescription);
        // Resume at Step 5 if analysis is already running / done
        if (status.proposalStatus === 'pending' || status.proposalStatus === 'ready') setStep(5);
      } catch { /* fresh workspace — start at step 1 */ }
      setBooting(false);
    })();
  }, [isLoading, isAuthenticated, router]);

  // ── Step 2: prefill existing LLM config ─────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    (async () => {
      try {
        const { config } = await api<{ config: { provider: LlmProviderId; baseUrl: string | null; model: string | null; hasApiKey: boolean } }>('/workspace/llm-config');
        setProvider(config.provider);
        if (config.baseUrl) setBaseUrl(config.baseUrl);
        if (config.model) setModel(config.model);
        setHasApiKey(config.hasApiKey);
      } catch { /* no config yet — keep defaults */ }
    })();
  }, [step]);

  // ── Step 3: load GitHub repos ────────────────────────────────────────────
  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      const { data } = await api<Ok<GitHubRepoListItem[]>>('/onboarding/github/repos');
      setRepos(data);
    } catch (e) {
      setReposError(errMsg(e, 'Could not load GitHub repositories.'));
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => { if (step === 3) loadRepos(); }, [step, loadRepos]);

  // ── Step 5: poll proposal until ready ────────────────────────────────────
  const fetchProposal = useCallback(async () => {
    try {
      const { data } = await api<Ok<OnboardingProposal>>('/onboarding/proposal');
      setProposal(data);
      return data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (step !== 5) return;
    fetchProposal();
    pollRef.current = setInterval(async () => {
      const p = await fetchProposal();
      if (p && p.status !== 'pending' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, fetchProposal]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const submitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim())        { setError('Company name is required.'); return; }
    if (!companyDescription.trim()) { setError('Company description is required.'); return; }
    setBusy(true); setError(null);
    try {
      await api('/onboarding/company', { method: 'POST', body: JSON.stringify({ companyName: companyName.trim(), companyDescription: companyDescription.trim() }) });
      setStep(2);
    } catch (e2) { setError(errMsg(e2, 'Failed to save company.')); }
    finally { setBusy(false); }
  };

  const submitLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    const preset = LLM_PROVIDERS.find(p => p.id === provider)!;
    if (!model.trim()) { setError('Model name is required.'); return; }
    if (preset.requiresApiKey && !apiKey.trim() && !hasApiKey) { setError('API key is required for this provider.'); return; }
    setBusy(true); setError(null);
    try {
      await api('/workspace/llm-config', {
        method: 'PATCH',
        body: JSON.stringify({
          provider,
          baseUrl: baseUrl.trim() || undefined,
          model:   model.trim(),
          // Keep the previously stored key when the field is left blank
          apiKey:  apiKey.trim() || undefined,
        }),
      });
      setStep(3);
    } catch (e2) { setError(errMsg(e2, 'Failed to save LLM config.')); }
    finally { setBusy(false); }
  };

  const toggleRepo = (r: GitHubRepoListItem) => {
    setSelected(prev => prev.some(s => s.fullName === r.fullName)
      ? prev.filter(s => s.fullName !== r.fullName)
      : [...prev, { repoUrl: `https://github.com/${r.fullName}`, repoName: r.name, fullName: r.fullName, branch: r.defaultBranch || 'main' }]);
  };

  const addManualRepo = () => {
    const m = manualUrl.trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    if (!m) { setError('Enter a valid GitHub repo URL (https://github.com/owner/repo).'); return; }
    const fullName = `${m[1]}/${m[2]}`;
    setError(null);
    setSelected(prev => prev.some(s => s.fullName === fullName)
      ? prev
      : [...prev, { repoUrl: `https://github.com/${fullName}`, repoName: m[2], fullName, branch: 'main' }]);
    setManualUrl('');
  };

  const submitRepos = async () => {
    if (!selected.length) { setError('Select at least one repository.'); return; }
    setBusy(true); setError(null);
    try {
      await api('/onboarding/repos', { method: 'POST', body: JSON.stringify({ repos: selected }) });
      setStep(4);
    } catch (e2) { setError(errMsg(e2, 'Failed to save repositories.')); }
    finally { setBusy(false); }
  };

  const submitScout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoutName.trim())        { setError('Scout name is required.'); return; }
    if (!scoutDescription.trim()) { setError('Scout description is required.'); return; }
    setBusy(true); setError(null);
    try {
      await api('/onboarding/scout', { method: 'POST', body: JSON.stringify({ scoutName: scoutName.trim(), scoutDescription: scoutDescription.trim() }) });
      setProposal(null);
      setStep(5);
    } catch (e2) { setError(errMsg(e2, 'Failed to start analysis.')); }
    finally { setBusy(false); }
  };

  const startEdit = (s: ProposedSkill) => {
    setEditingId(s.tempId);
    setEdit({ realName: s.realName, roleTitle: s.roleTitle, department: s.department, description: s.description });
  };

  const saveEdit = async (tempId: string) => {
    setBusy(true); setError(null);
    try {
      const patch: Record<string, string> = {};
      if (edit.realName.trim())    patch.realName    = edit.realName.trim();
      if (edit.roleTitle.trim())   patch.roleTitle   = edit.roleTitle.trim();
      if (edit.department.trim())  patch.department  = edit.department.trim();
      patch.description = edit.description;
      const { data } = await api<Ok<ProposedSkill[]>>(`/onboarding/proposal/${tempId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setProposal(p => p ? { ...p, proposedSkills: data } : p);
      setEditingId(null);
    } catch (e2) { setError(errMsg(e2, 'Failed to update skill.')); }
    finally { setBusy(false); }
  };

  const deleteSkill = async (tempId: string) => {
    setBusy(true); setError(null);
    try {
      const { data } = await api<Ok<ProposedSkill[]>>(`/onboarding/proposal/${tempId}`, { method: 'DELETE' });
      setProposal(p => p ? { ...p, proposedSkills: data } : p);
    } catch (e2) { setError(errMsg(e2, 'Failed to delete skill.')); }
    finally { setBusy(false); }
  };

  const addSkill = async () => {
    if (!newSkill.realName.trim() || !newSkill.roleTitle.trim() || !newSkill.department.trim()) {
      setError('Name, role title and department are required.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const { data } = await api<Ok<ProposedSkill[]>>('/onboarding/proposal/skill', {
        method: 'POST',
        body: JSON.stringify({
          slug:           slugify(newSkill.roleTitle),
          realName:       newSkill.realName.trim(),
          roleTitle:      newSkill.roleTitle.trim(),
          department:     newSkill.department.trim(),
          hierarchyLevel: 5,
        }),
      });
      setProposal(p => p ? { ...p, proposedSkills: data } : p);
      setAddingSkill(false);
      setNewSkill({ realName: '', roleTitle: '', department: 'Engineering' });
    } catch (e2) { setError(errMsg(e2, 'Failed to add skill.')); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await api<Ok<CommitProposalResponse>>('/onboarding/commit', { method: 'POST' });
      setCommitResult(data);
    } catch (e2) { setError(errMsg(e2, 'Failed to create your team.')); }
    finally { setBusy(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoading || booting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="onboarding-loading">
        <Loader2 className="h-8 w-8 animate-spin text-aria-500" />
      </div>
    );
  }

  const skills = proposal?.proposedSkills ?? [];
  const departments = [...new Set(skills.map(s => s.department))];
  const goBack = () => { setError(null); setStep(s => Math.max(1, s - 1) as typeof step); };

  return (
    <div className="min-h-screen bg-background py-10 px-4" data-testid="onboarding-page">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <BrainCircuit className="h-6 w-6 text-aria-500" />
          <span className="font-bold text-lg tracking-tight">ARIA — Set up your AI company</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-10" data-testid="onboarding-steps">
          {STEPS.map(({ n, label, icon: Icon }) => (
            <div key={n} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-1">
                <div
                  data-testid={`step-indicator-${n}`}
                  data-state={n < step ? 'done' : n === step ? 'active' : 'todo'}
                  className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    n < step ? 'bg-aria-500 border-aria-500 text-white'
                    : n === step ? 'border-aria-500 text-aria-400 bg-aria-950/40'
                    : 'border-border text-muted-foreground'
                  }`}
                >
                  {n < step ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-[10px] ${n === step ? 'text-aria-400 font-semibold' : 'text-muted-foreground'}`}>{label}</span>
              </div>
              {n < 6 && <div className={`h-0.5 w-6 mb-4 transition-all ${n < step ? 'bg-aria-500' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" data-testid="onboarding-error"
            className="mb-6 rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Step 1: Company ── */}
        {step === 1 && (
          <Card data-testid="onboarding-step-1" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader>
              <CardTitle>What are you building?</CardTitle>
              <CardDescription>Step 1 of 6 — Your AI team uses this to understand the mission.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitCompany} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="company-name">Company name</Label>
                  <Input id="company-name" data-testid="company-name-input" value={companyName}
                    onChange={e => { setCompanyName(e.target.value); setError(null); }}
                    placeholder="Acme Robotics" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-description">What does your company do?</Label>
                  <Textarea id="company-description" data-testid="company-description-input" rows={4}
                    value={companyDescription}
                    onChange={e => { setCompanyDescription(e.target.value); setError(null); }}
                    placeholder="We build a SaaS platform that helps teams automate…" />
                </div>
                <Button type="submit" variant="aria" className="w-full" size="lg" disabled={busy} data-testid="company-continue-btn">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <>Continue<ChevronRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: LLM config ── */}
        {step === 2 && (
          <Card data-testid="onboarding-step-2" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader>
              <CardTitle>Connect your AI model</CardTitle>
              <CardDescription>Step 2 of 6 — The scout and your agents run on this model.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitLlm} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <div data-testid="llm-provider-select">
                    <Select value={provider} onValueChange={(v) => {
                      const p = LLM_PROVIDERS.find(x => x.id === v as LlmProviderId)!;
                      setProvider(p.id); setBaseUrl(p.defaultBaseUrl); setModel(p.defaultModel); setError(null);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Choose a provider" /></SelectTrigger>
                      <SelectContent>
                        {LLM_PROVIDERS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="llm-base-url">Base URL {provider === 'anthropic' || provider === 'openai' ? <span className="text-muted-foreground">(optional)</span> : null}</Label>
                  <Input id="llm-base-url" data-testid="llm-base-url-input" value={baseUrl}
                    onChange={e => { setBaseUrl(e.target.value); setError(null); }} placeholder="http://localhost:11434" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="llm-model">Model</Label>
                  <Input id="llm-model" data-testid="llm-model-input" value={model}
                    onChange={e => { setModel(e.target.value); setError(null); }} placeholder="qwen2.5-coder:7b" />
                </div>
                {LLM_PROVIDERS.find(p => p.id === provider)!.requiresApiKey && (
                  <div className="space-y-1.5">
                    <Label htmlFor="llm-api-key">API key {hasApiKey && <span className="text-muted-foreground">(saved — leave blank to keep)</span>}</Label>
                    <Input id="llm-api-key" data-testid="llm-api-key-input" type="password" value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setError(null); }}
                      placeholder={hasApiKey ? '••••••••' : 'sk-…'} autoComplete="off" />
                  </div>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" onClick={goBack} className="w-24" data-testid="onboarding-back-btn">
                    <ChevronLeft className="h-4 w-4 mr-1" />Back
                  </Button>
                  <Button type="submit" variant="aria" className="flex-1" disabled={busy} data-testid="llm-continue-btn">
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <>Save &amp; Continue<ChevronRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Repos ── */}
        {step === 3 && (
          <Card data-testid="onboarding-step-3" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader>
              <CardTitle>Pick the repositories to analyse</CardTitle>
              <CardDescription>Step 3 of 6 — The scout reads these to propose your team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {reposLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center" data-testid="repos-loading">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading your GitHub repositories…
                </div>
              )}

              {!reposLoading && reposError && (
                <div className="rounded-md border border-border bg-card p-4 space-y-3" data-testid="github-not-connected">
                  <p className="text-sm text-muted-foreground">{reposError}</p>
                  <a href={`${MIDDLEWARE_URL}/api/auth/github/start`}>
                    <Button type="button" variant="outline" size="sm">
                      <Github className="h-4 w-4 mr-2" /> Connect GitHub
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground">…or add repositories by URL below.</p>
                </div>
              )}

              {!reposLoading && !reposError && repos.length > 0 && (
                <ul className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border" data-testid="repo-list">
                  {repos.map(r => {
                    const isSelected = selected.some(s => s.fullName === r.fullName);
                    return (
                      <li key={r.id}>
                        <button type="button" data-testid="repo-item" aria-pressed={isSelected}
                          onClick={() => toggleRepo(r)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                            isSelected ? 'bg-aria-950/40 text-foreground' : 'hover:bg-accent text-muted-foreground'
                          }`}>
                          <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-aria-500 border-aria-500' : 'border-border'}`}>
                            {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </span>
                          <span className="font-medium truncate">{r.fullName}</span>
                          {r.language && <span className="ml-auto text-xs text-muted-foreground shrink-0">{r.language}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Manual fallback — works without GitHub OAuth */}
              <div className="flex gap-2">
                <Input data-testid="manual-repo-url-input" value={manualUrl}
                  onChange={e => { setManualUrl(e.target.value); setError(null); }}
                  placeholder="https://github.com/owner/repo" />
                <Button type="button" variant="outline" onClick={addManualRepo} data-testid="add-manual-repo-btn">
                  <Plus className="h-4 w-4 mr-1" />Add
                </Button>
              </div>

              {selected.length > 0 && (
                <div className="flex flex-wrap gap-2" data-testid="selected-repos">
                  {selected.map(s => (
                    <span key={s.fullName} data-testid="selected-repo-chip"
                      className="inline-flex items-center gap-1.5 rounded-full bg-aria-950/60 border border-aria-800/50 px-3 py-1 text-xs text-aria-300">
                      {s.fullName}
                      <button type="button" aria-label={`Remove ${s.fullName}`}
                        onClick={() => setSelected(prev => prev.filter(x => x.fullName !== s.fullName))}
                        className="hover:text-foreground"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={goBack} className="w-24" data-testid="onboarding-back-btn">
                  <ChevronLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button type="button" variant="aria" className="flex-1" disabled={busy || !selected.length}
                  onClick={submitRepos} data-testid="repos-continue-btn">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <>Continue with {selected.length || 'no'} repo{selected.length === 1 ? '' : 's'}<ChevronRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Scout ── */}
        {step === 4 && (
          <Card data-testid="onboarding-step-4" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader>
              <CardTitle>Meet your scout</CardTitle>
              <CardDescription>Step 4 of 6 — The scout analyses your code and drafts the team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitScout} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="scout-name">Scout name</Label>
                  <Input id="scout-name" data-testid="scout-name-input" value={scoutName}
                    onChange={e => { setScoutName(e.target.value); setError(null); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scout-description">Scout persona</Label>
                  <Textarea id="scout-description" data-testid="scout-description-input" rows={4}
                    value={scoutDescription}
                    onChange={e => { setScoutDescription(e.target.value); setError(null); }} />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="ghost" onClick={goBack} className="w-24" data-testid="onboarding-back-btn">
                    <ChevronLeft className="h-4 w-4 mr-1" />Back
                  </Button>
                  <Button type="submit" variant="aria" className="flex-1" disabled={busy} data-testid="scout-continue-btn">
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Starting analysis…</> : <>Start analysis<ChevronRight className="h-4 w-4 ml-2" /></>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Review proposal ── */}
        {step === 5 && (
          <Card data-testid="onboarding-step-5" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader>
              <CardTitle>Review your AI team</CardTitle>
              <CardDescription>Step 5 of 6 — Edit, add or remove agents before creating the company.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(!proposal || proposal.status === 'pending') && (
                <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground" data-testid="proposal-loading">
                  <Loader2 className="h-8 w-8 animate-spin text-aria-500" />
                  <p>{scoutName || 'Your scout'} is analysing the codebase and drafting your team…</p>
                  <p className="text-xs">This can take a minute — the page updates automatically.</p>
                </div>
              )}

              {proposal?.status === 'failed' && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 space-y-3" data-testid="proposal-failed">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> Analysis failed{proposal.errorMessage ? `: ${proposal.errorMessage}` : '.'}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setStep(4)} data-testid="proposal-retry-btn">
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back to scout — try again
                  </Button>
                </div>
              )}

              {proposal?.status === 'ready' && (
                <div className="space-y-3" data-testid="proposal-ready">
                  {[...skills].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel).map(s => (
                    <div key={s.tempId} data-testid="proposal-skill-card"
                      className="rounded-lg border border-border bg-card p-4">
                      {editingId === s.tempId ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input aria-label="Agent name" data-testid="skill-edit-name" value={edit.realName}
                              onChange={e => setEdit(v => ({ ...v, realName: e.target.value }))} />
                            <Input aria-label="Role title" data-testid="skill-edit-role" value={edit.roleTitle}
                              onChange={e => setEdit(v => ({ ...v, roleTitle: e.target.value }))} />
                          </div>
                          <Input aria-label="Department" data-testid="skill-edit-department" value={edit.department}
                            onChange={e => setEdit(v => ({ ...v, department: e.target.value }))} />
                          <Textarea aria-label="Description" data-testid="skill-edit-description" rows={2} value={edit.description}
                            onChange={e => setEdit(v => ({ ...v, description: e.target.value }))} />
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                            <Button type="button" variant="aria" size="sm" disabled={busy}
                              onClick={() => saveEdit(s.tempId)} data-testid="skill-save-btn">Save</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-aria-800 flex items-center justify-center text-xs font-bold text-aria-200 shrink-0">
                            {s.realName[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {s.realName} <span className="text-muted-foreground font-normal">— {s.roleTitle}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.department} · Level {s.hierarchyLevel} · Risk {s.riskClass}
                              {s.isAlwaysPresent && <span className="ml-1.5 text-aria-400">· required</span>}
                            </p>
                            {s.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                              onClick={() => startEdit(s)} data-testid="skill-edit-btn">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!s.isAlwaysPresent && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove"
                                disabled={busy} onClick={() => deleteSkill(s.tempId)} data-testid="skill-delete-btn">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {addingSkill ? (
                    <div className="rounded-lg border border-dashed border-border p-4 space-y-2" data-testid="add-skill-form">
                      <div className="grid grid-cols-2 gap-2">
                        <Input aria-label="New agent name" data-testid="new-skill-name" placeholder="Persona name"
                          value={newSkill.realName} onChange={e => setNewSkill(v => ({ ...v, realName: e.target.value }))} />
                        <Input aria-label="New role title" data-testid="new-skill-role" placeholder="Role title"
                          value={newSkill.roleTitle} onChange={e => setNewSkill(v => ({ ...v, roleTitle: e.target.value }))} />
                      </div>
                      <Input aria-label="New department" data-testid="new-skill-department" placeholder="Department"
                        value={newSkill.department} onChange={e => setNewSkill(v => ({ ...v, department: e.target.value }))} />
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingSkill(false)}>Cancel</Button>
                        <Button type="button" variant="aria" size="sm" disabled={busy} onClick={addSkill} data-testid="new-skill-save-btn">
                          Add agent
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" className="w-full" onClick={() => setAddingSkill(true)} data-testid="add-skill-btn">
                      <Plus className="h-4 w-4 mr-2" /> Add a custom agent
                    </Button>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="ghost" onClick={goBack} className="w-24" data-testid="onboarding-back-btn">
                      <ChevronLeft className="h-4 w-4 mr-1" />Back
                    </Button>
                    <Button type="button" variant="aria" className="flex-1" disabled={busy || !skills.length}
                      onClick={() => { setError(null); setStep(6); }} data-testid="review-continue-btn">
                      Looks good<ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 6: Commit ── */}
        {step === 6 && (
          <Card data-testid="onboarding-step-6" className="border-border/60 shadow-xl bg-card/80">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-2">
                <div className="h-14 w-14 rounded-full bg-aria-950/60 border-2 border-aria-500 flex items-center justify-center">
                  <Rocket className="h-6 w-6 text-aria-400" />
                </div>
              </div>
              <CardTitle>{commitResult ? 'Your AI company is live!' : 'Create your AI company'}</CardTitle>
              <CardDescription>Step 6 of 6 — {commitResult ? 'The team is ready to work.' : 'One click away.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!commitResult && (
                <>
                  <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-1" data-testid="commit-summary">
                    <p><span className="font-semibold">{skills.length}</span> agents across <span className="font-semibold">{departments.length}</span> departments:</p>
                    <p className="text-xs text-muted-foreground">{departments.join(' · ')}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" onClick={goBack} className="w-24" data-testid="onboarding-back-btn">
                      <ChevronLeft className="h-4 w-4 mr-1" />Back
                    </Button>
                    <Button type="button" variant="aria" className="flex-1" size="lg" disabled={busy}
                      onClick={commit} data-testid="commit-btn">
                      {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating your team…</> : 'Create company'}
                    </Button>
                  </div>
                </>
              )}
              {commitResult && (
                <div className="space-y-4 text-center" data-testid="commit-success">
                  <p className="text-sm text-muted-foreground">
                    {commitResult.skillCount} agents hired into {commitResult.teamCount} teams.
                  </p>
                  <Button type="button" variant="aria" className="w-full" size="lg"
                    onClick={() => router.push('/dashboard/team')} data-testid="go-to-team-btn">
                    Meet your team <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
