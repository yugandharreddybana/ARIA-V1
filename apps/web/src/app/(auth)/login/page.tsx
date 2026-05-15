'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { Eye, EyeOff, Loader2, Github } from 'lucide-react';

const MIDDLEWARE_URL = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('error') === 'github_denied' ? 'GitHub sign-in was cancelled.' :
    params.get('error') === 'github_failed' ? 'GitHub sign-in failed. Please try again.' :
    params.get('error') === 'invalid_state' ? 'Session expired. Please try again.' : null
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return; }
    setIsLoading(true); setError(null);
    try {
      await login(form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally { setIsLoading(false); }
  };

  return (
    <Card className="w-full max-w-md border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <CardDescription>Sign in to your ARIA workspace</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a href={`${MIDDLEWARE_URL}/api/auth/github/start`}>
          <Button type="button" variant="outline" className="w-full" asChild>
            <span><Github className="h-4 w-4 mr-2" /> Continue with GitHub</span>
          </Button>
        </a>
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="ada@company.com" value={form.email} onChange={handleChange} autoComplete="email" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Your password" value={form.password} onChange={handleChange} autoComplete="current-password" className="pr-10" />
              <button type="button" onClick={() => setShowPassword(p => !p)} aria-label={showPassword ? 'Hide' : 'Show'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" variant="aria" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in...</> : 'Sign In'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-aria-400 hover:text-aria-300 font-medium">Create workspace</Link>
        </p>
      </CardFooter>
    </Card>
  );
}
