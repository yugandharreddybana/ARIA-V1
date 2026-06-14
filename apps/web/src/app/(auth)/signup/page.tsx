'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Eye, EyeOff, Loader2, Github,
  CheckCircle2, Circle, ChevronRight, ChevronLeft,
  Server, Key, Zap, Wifi, WifiOff, BrainCircuit,
} from 'lucide-react';

const MIDDLEWARE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

// ────────────────────────────────────────────────────────────────
// Step 1 — Password rules
// ────────────────────────────────────────────────────────────────
const PASSWORD_RULES = [
  { key: 'length',  label: 'At least 8 characters',  test: (p: string) => p.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter',    test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower',   label: 'One lowercase letter',    test: (p: string) => /[a-z]/.test(p) },
  { key: 'number',  label: 'One number',              test: (p: string) => /[0-9]/.test(p) },
  { key: 'special', label: 'One special character',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;
type RuleKey = typeof PASSWORD_RULES[number]['key'];

function evaluatePassword(pw: string) {
  const passed = {} as Record<RuleKey, boolean>;
  let score = 0;
  for (const rule of PASSWORD_RULES) {
    passed[rule.key] = rule.test(pw);
    if (passed[rule.key]) score++;
  }
  return { passed, score };
}

const STRENGTH_LABEL = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const STRENGTH_COLOR = ['', 'text-destructive', 'text-destructive', 'text-amber-400', 'text-amber-400', 'text-emerald-400'] as const;
const BAR_COLOR      = ['bg-muted', 'bg-destructive', 'bg-destructive', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'] as const;

// ────────────────────────────────────────────────────────────────
// Step 2 — LLM provider presets
// ────────────────────────────────────────────────────────────────
type LlmProvider = 'ollama' | 'anthropic' | 'openai' | 'custom';

const PROVIDER_PRESETS: {
  id: LlmProvider;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  modelPlaceholder: string;
  apiKeyPlaceholder: string;
}[] = [
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    description: 'Run models locally on your machine. Private, free, no API key needed.',
    icon: <Server className="h-5 w-5" />,
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5-coder:7b',
    modelPlaceholder: 'e.g. qwen2.5-coder:7b',
    apiKeyPlaceholder: '',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    description: 'Use Claude models via the Anthropic API. Requires an API key.',
    icon: <BrainCircuit className="h-5 w-5" />,
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: '',
    defaultModel: 'claude-sonnet-4-5',
    modelPlaceholder: 'e.g. claude-sonnet-4-5',
    apiKeyPlaceholder: 'sk-ant-api...',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT / o-series)',
    description: 'Use GPT or o-series models via the OpenAI API. Requires an API key.',
    icon: <Key className="h-5 w-5" />,
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o',
    modelPlaceholder: 'e.g. gpt-4o',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'custom',
    label: 'Custom / Self-hosted',
    description: 'Any OpenAI-compatible endpoint — vLLM, LM Studio, Together AI, etc.',
    icon: <Zap className="h-5 w-5" />,
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8000/v1',
    defaultModel: '',
    modelPlaceholder: 'e.g. mistral-7b-instruct',
    apiKeyPlaceholder: 'Optional — leave blank if not required',
  },
];

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────
export default function SignupPage() {
  const router    = useRouter();
  const { signup } = useAuth();

  // Step tracker: 1 | 2 | 3
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 state ──
  const [form,        setForm]        = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw,      setShowPw]      = useState(false);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error,   setStep1Error]  = useState<string | null>(null);
  const [pwState,     setPwState]     = useState<{ passed: Record<RuleKey, boolean>; score: number } | null>(null);

  // ── Step 2 state ──
  const [provider,    setProvider]    = useState<LlmProvider>('ollama');
  const [baseUrl,     setBaseUrl]     = useState('http://localhost:11434');
  const [model,       setModel]       = useState('qwen2.5-coder:7b');
  const [apiKey,      setApiKey]      = useState('');
  const [showApiKey,  setShowApiKey]  = useState(false);
  const [testStatus,  setTestStatus]  = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error,   setStep2Error]  = useState<string | null>(null);

  const preset = PROVIDER_PRESETS.find(p => p.id === provider)!;

  // ── Step 1 handlers ──
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setStep1Error(null);
    if (name === 'password') setPwState(value ? evaluatePassword(value) : null);
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim())  { setStep1Error('Full name is required.');      return; }
    if (!form.email)        { setStep1Error('Email is required.');          return; }
    const { passed, score } = evaluatePassword(form.password);
    if (score < 5) {
      const missing = PASSWORD_RULES.filter(r => !passed[r.key]).map(r => r.label).join(', ');
      setStep1Error(`Password requirements not met: ${missing}.`);
      return;
    }
    if (form.password !== form.confirm) { setStep1Error('Passwords do not match.'); return; }
    setStep1Loading(true); setStep1Error(null);
    try {
      await signup(form.name.trim(), form.email, form.password);
      setStep(2);
    } catch (err) {
      setStep1Error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setStep1Loading(false);
    }
  };

  // ── Step 2 handlers ──
  const handleProviderChange = (id: LlmProvider) => {
    setProvider(id);
    const p = PROVIDER_PRESETS.find(x => x.id === id)!;
    setBaseUrl(p.defaultBaseUrl);
    setModel(p.defaultModel);
    setApiKey('');
    setTestStatus('idle');
    setTestMessage('');
    setStep2Error(null);
  };

  const handleTestConnection = useCallback(async () => {
    if (!model.trim()) { setStep2Error('Model name is required to test connection.'); return; }
    if (preset.requiresBaseUrl && !baseUrl.trim()) { setStep2Error('Base URL is required.'); return; }
    if (preset.requiresApiKey && !apiKey.trim())   { setStep2Error('API key is required.'); return; }
    setTestStatus('testing');
    setTestMessage('');
    setStep2Error(null);
    try {
      const result = await api<{ ok: boolean; message: string; latencyMs?: number }>(
        '/workspace/llm-config/test',
        {
          method: 'POST',
          body: JSON.stringify({
            provider,
            baseUrl: baseUrl.trim() || undefined,
            model:   model.trim(),
            apiKey:  apiKey.trim() || undefined,
          }),
        },
      );
      setTestStatus(result.ok ? 'ok' : 'fail');
      setTestMessage(result.message + (result.latencyMs ? ` (${result.latencyMs}ms)` : ''));
    } catch (err) {
      setTestStatus('fail');
      setTestMessage(err instanceof ApiError ? err.message : 'Connection test failed');
    }
  }, [provider, baseUrl, model, apiKey, preset]);

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim())                             { setStep2Error('Model name is required.');     return; }
    if (preset.requiresBaseUrl && !baseUrl.trim()) { setStep2Error('Base URL is required.');       return; }
    if (preset.requiresApiKey && !apiKey.trim())   { setStep2Error('API key is required.');        return; }
    setStep2Loading(true); setStep2Error(null);
    try {
      await api('/workspace/llm-config', {
        method: 'PATCH',
        body: JSON.stringify({
          provider,
          baseUrl: baseUrl.trim() || undefined,
          model:   model.trim(),
          apiKey:  apiKey.trim() || undefined,
        }),
      });
      setStep(3);
    } catch (err) {
      setStep2Error(err instanceof ApiError ? err.message : 'Failed to save LLM config.');
    } finally {
      setStep2Loading(false);
    }
  };

  // ── Step 3 handler ──
  const handleFinish = () => router.push('/dashboard');

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-lg">
      {/* Step progress */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {([1, 2, 3] as const).map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all ${
              s < step  ? 'bg-aria-500 border-aria-500 text-white'
              : s === step ? 'border-aria-500 text-aria-400 bg-aria-950/40'
              : 'border-border text-muted-foreground'
            }`}>
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={`h-0.5 w-8 transition-all ${s < step ? 'bg-aria-500' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Account ── */}
      {step === 1 && (
        <Card className="border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
            <CardDescription>Step 1 of 3 — Account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <a href={`${MIDDLEWARE_URL}/api/auth/github/start`}>
              <Button type="button" variant="outline" className="w-full">
                <Github className="h-4 w-4 mr-2" /> Continue with GitHub
              </Button>
            </a>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <form onSubmit={handleStep1Submit} className="space-y-4" noValidate>
              {step1Error && (
                <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                  {step1Error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" type="text" placeholder="Ada Lovelace"
                  value={form.name} onChange={handleFormChange} autoComplete="name" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" placeholder="ada@company.com"
                  value={form.email} onChange={handleFormChange} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password" name="password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={form.password} onChange={handleFormChange}
                    autoComplete="new-password" className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwState && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex gap-0.5 h-1.5">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={`flex-1 rounded-full transition-all ${
                            i <= pwState.score ? BAR_COLOR[pwState.score] : 'bg-muted'
                          }`} />
                        ))}
                      </div>
                      <span className={`text-xs font-medium w-12 text-right ${STRENGTH_COLOR[pwState.score]}`}>
                        {STRENGTH_LABEL[pwState.score]}
                      </span>
                    </div>
                    <ul className="grid grid-cols-1 gap-0.5">
                      {PASSWORD_RULES.map(rule => {
                        const ok = pwState.passed[rule.key];
                        return (
                          <li key={rule.key} className={`flex items-center gap-1.5 text-[11px] ${
                            ok ? 'text-emerald-400' : 'text-muted-foreground'
                          }`}>
                            {ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" name="confirm" type="password" placeholder="Repeat password"
                  value={form.confirm} onChange={handleFormChange} autoComplete="new-password" />
              </div>
              <Button type="submit" variant="aria" className="w-full" size="lg"
                disabled={step1Loading || (pwState !== null && pwState.score < 5)}>
                {step1Loading
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating workspace...</>
                  : <><span>Continue</span><ChevronRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-aria-400 hover:text-aria-300 font-medium">Sign in</Link>
            </p>
          </CardFooter>
        </Card>
      )}

      {/* ── Step 2: LLM / Model config ── */}
      {step === 2 && (
        <Card className="border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Connect your AI model</CardTitle>
            <CardDescription>Step 2 of 3 — Choose how ARIA accesses an LLM</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStep2Submit} className="space-y-5">
              {step2Error && (
                <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                  {step2Error}
                </div>
              )}

              {/* Provider cards */}
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                      provider === p.id
                        ? 'border-aria-500 bg-aria-950/40 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-aria-800'
                    }`}
                  >
                    <div className={`${ provider === p.id ? 'text-aria-400' : 'text-muted-foreground' }`}>
                      {p.icon}
                    </div>
                    <span className="text-xs font-semibold">{p.label}</span>
                    <span className="text-[10px] leading-relaxed line-clamp-2">{p.description}</span>
                  </button>
                ))}
              </div>

              {/* Base URL — shown for ollama + custom */}
              {preset.requiresBaseUrl && (
                <div className="space-y-1.5">
                  <Label htmlFor="llm-base-url">Base URL</Label>
                  <Input
                    id="llm-base-url"
                    value={baseUrl}
                    onChange={e => { setBaseUrl(e.target.value); setTestStatus('idle'); }}
                    placeholder={preset.defaultBaseUrl || 'https://...'}
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-muted-foreground">The root URL of your LLM server (no trailing slash).</p>
                </div>
              )}

              {/* API Key — shown for anthropic + openai + custom (optional) */}
              {(preset.requiresApiKey || provider === 'custom') && (
                <div className="space-y-1.5">
                  <Label htmlFor="llm-api-key">
                    API Key{!preset.requiresApiKey && <span className="text-muted-foreground ml-1">(optional)</span>}
                  </Label>
                  <div className="relative">
                    <Input
                      id="llm-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); setTestStatus('idle'); }}
                      placeholder={preset.apiKeyPlaceholder}
                      autoComplete="off"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowApiKey(s => !s)}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Stored encrypted at rest. Never transmitted in plaintext.</p>
                </div>
              )}

              {/* Model name */}
              <div className="space-y-1.5">
                <Label htmlFor="llm-model">Model</Label>
                <Input
                  id="llm-model"
                  value={model}
                  onChange={e => { setModel(e.target.value); setTestStatus('idle'); }}
                  placeholder={preset.modelPlaceholder}
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  {provider === 'ollama'
                    ? 'Must be pulled locally first (ollama pull <model>).'
                    : 'The model identifier as accepted by the API.'}
                </p>
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  className="shrink-0"
                >
                  {testStatus === 'testing'
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Testing...</>
                    : 'Test Connection'}
                </Button>
                {testStatus !== 'idle' && testStatus !== 'testing' && (
                  <div className={`flex items-center gap-1.5 text-xs ${
                    testStatus === 'ok' ? 'text-emerald-400' : 'text-destructive'
                  }`}>
                    {testStatus === 'ok'
                      ? <Wifi    className="h-3.5 w-3.5 shrink-0" />
                      : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
                    <span className="leading-tight">{testMessage}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} className="w-24">
                  <ChevronLeft className="h-4 w-4 mr-1" />Back
                </Button>
                <Button type="submit" variant="aria" className="flex-1" disabled={step2Loading}>
                  {step2Loading
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                    : <><span>Save &amp; Continue</span><ChevronRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Done ── */}
      {step === 3 && (
        <Card className="border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <div className="h-16 w-16 rounded-full bg-aria-950/60 border-2 border-aria-500 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-aria-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">You&apos;re all set!</CardTitle>
            <CardDescription>Step 3 of 3 — Workspace ready</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-medium">What happens next:</p>
              <ul className="space-y-2">
                {[
                  'Connect a GitHub repo in Projects to let ARIA analyse your codebase',
                  'ARIA will propose a full AI engineering team based on your codebase',
                  'Start a session and your AI team begins working on real tickets',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-xs font-mono text-aria-600 mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="aria" className="w-full" size="lg" onClick={handleFinish}>
              Go to Dashboard <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
