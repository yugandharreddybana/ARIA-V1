'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { Eye, EyeOff, Loader2, Github, CheckCircle2, Circle } from 'lucide-react';

const MIDDLEWARE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

// Mirrors backend signupSchema rules exactly
const PASSWORD_RULES = [
  { key: 'length',  label: 'At least 8 characters',    test: (p: string) => p.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter',      test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower',   label: 'One lowercase letter',      test: (p: string) => /[a-z]/.test(p) },
  { key: 'number',  label: 'One number',                test: (p: string) => /[0-9]/.test(p) },
  { key: 'special', label: 'One special character',     test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

type RuleKey = typeof PASSWORD_RULES[number]['key'];

function evaluatePassword(pw: string): { passed: Record<RuleKey, boolean>; score: number } {
  const passed = {} as Record<RuleKey, boolean>;
  let score = 0;
  for (const rule of PASSWORD_RULES) {
    passed[rule.key] = rule.test(pw);
    if (passed[rule.key]) score++;
  }
  return { passed, score };
}

const STRENGTH_LABEL = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const STRENGTH_COLOR = [
  '',
  'text-destructive',
  'text-destructive',
  'text-amber-400',
  'text-amber-400',
  'text-emerald-400',
] as const;
const BAR_COLOR = [
  'bg-muted',
  'bg-destructive',
  'bg-destructive',
  'bg-amber-400',
  'bg-amber-400',
  'bg-emerald-500',
] as const;

export default function SignupPage() {
  const router  = useRouter();
  const { signup } = useAuth();
  const [form,        setForm]        = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [pwState,     setPwState]     = useState<{ passed: Record<RuleKey, boolean>; score: number } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError(null);
    if (name === 'password') {
      setPwState(value ? evaluatePassword(value) : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim())  { setError('Full name is required.'); return; }
    if (!form.email)        { setError('Email is required.'); return; }
    // Mirror all backend signupSchema password rules client-side
    const { passed, score } = evaluatePassword(form.password);
    if (score < 5) {
      const missing = PASSWORD_RULES.filter(r => !passed[r.key]).map(r => r.label).join(', ');
      setError(`Password requirements not met: ${missing}.`);
      return;
    }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setIsLoading(true); setError(null);
    try {
      await signup(form.name.trim(), form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
        <CardDescription>Start using ARIA for free</CardDescription>
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
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" type="text" placeholder="Ada Lovelace"
              value={form.name} onChange={handleChange}
              autoComplete="name" autoFocus
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" name="email" type="email" placeholder="ada@company.com"
              value={form.email} onChange={handleChange}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password" name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={form.password} onChange={handleChange}
                autoComplete="new-password" className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength meter — only shown when user has typed */}
            {pwState && (
              <div className="mt-2 space-y-2">
                {/* Bar + label */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-0.5 h-1.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-200 ${
                          i <= pwState.score ? BAR_COLOR[pwState.score] : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-medium w-12 text-right ${STRENGTH_COLOR[pwState.score]}`}>
                    {STRENGTH_LABEL[pwState.score]}
                  </span>
                </div>

                {/* Rule checklist */}
                <ul className="grid grid-cols-1 gap-0.5">
                  {PASSWORD_RULES.map(rule => {
                    const ok = pwState.passed[rule.key];
                    return (
                      <li key={rule.key} className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                        ok ? 'text-emerald-400' : 'text-muted-foreground'
                      }`}>
                        {ok
                          ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                          : <Circle       className="h-3 w-3 shrink-0" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" placeholder="Repeat password"
              value={form.confirm} onChange={handleChange}
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit" variant="aria" className="w-full" size="lg"
            disabled={isLoading || (pwState !== null && pwState.score < 5)}
          >
            {isLoading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating workspace...</>
              : 'Create Workspace'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-aria-400 hover:text-aria-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
