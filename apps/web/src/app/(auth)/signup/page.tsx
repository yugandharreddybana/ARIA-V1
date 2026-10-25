'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const MIDDLEWARE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

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

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwState, setPwState] = useState<{ passed: Record<RuleKey, boolean>; score: number } | null>(null);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError(null);
    if (name === 'password') setPwState(value ? evaluatePassword(value) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Full name is required.'); return; }
    if (!form.email) { setError('Email is required.'); return; }
    const { passed, score } = evaluatePassword(form.password);
    if (score < 5) {
      const missing = PASSWORD_RULES.filter(r => !passed[r.key]).map(r => r.label).join(', ');
      setError(`Password requirements not met: ${missing}.`);
      return;
    }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError(null);
    try {
      await signup(form.name.trim(), form.email, form.password);
      router.push('/setup');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Next you will name a project, connect a model, and read a repository.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a href={`${MIDDLEWARE_URL}/api/auth/github/start`}>
          <Button type="button" variant="outline" className="w-full">Continue with GitHub</Button>
        </a>
        <p className="text-center text-xs text-muted-foreground">or use email</p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" type="text" placeholder="Ada Lovelace" value={form.name} onChange={handleFormChange} autoComplete="name" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" name="email" type="email" placeholder="ada@company.com" value={form.email} onChange={handleFormChange} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPw ? 'text' : 'password'} placeholder="Min. 8 characters" value={form.password} onChange={handleFormChange} autoComplete="new-password" className="pr-16" />
              <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {pwState && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map(rule => (
                  <li key={rule.key} className={pwState.passed[rule.key] ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'}>
                    {pwState.passed[rule.key] ? 'Done' : 'Needed'}: {rule.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" placeholder="Repeat password" value={form.confirm} onChange={handleFormChange} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading || (pwState !== null && pwState.score < 5)}>
            {loading ? 'Creating account…' : 'Continue'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary">Sign in</Link>
        </p>
      </CardFooter>
    </Card>
  );
}
