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
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Github } from 'lucide-react';

const MIDDLEWARE = process.env.NEXT_PUBLIC_MIDDLEWARE_URL ?? 'http://localhost:3001';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'Special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      {PASSWORD_RULES.map(({ label, test }) => {
        const pass = test(password);
        return (
          <div key={label} className="flex items-center gap-2 text-xs">
            {pass ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={pass ? 'text-emerald-500' : 'text-muted-foreground'}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFieldErrors(prev => ({ ...prev, [name]: '' }));
    setError(null);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!form.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    else if (!PASSWORD_RULES.every(r => r.test(form.password))) errs.password = 'Password does not meet requirements';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await signup(form.name.trim(), form.email.trim(), form.password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const fe: Record<string, string> = {};
          err.details.forEach(d => { fe[d.field] = d.message; });
          setFieldErrors(fe);
        } else setError(err.message);
      } else setError('Something went wrong.');
    } finally { setIsLoading(false); }
  };

  return (
    <Card className="w-full max-w-md border-border/60 shadow-xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
        <CardDescription>Set up ARIA for your engineering team</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a href={`${MIDDLEWARE}/api/auth/github/start`}
          className="flex items-center justify-center gap-2 w-full rounded-md border border-border bg-card hover:bg-muted px-4 py-2 text-sm font-medium transition-colors">
          <Github className="h-4 w-4" />Continue with GitHub
        </a>
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or create with email</span></div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" placeholder="Ada Lovelace" value={form.name} onChange={handleChange} autoComplete="name" autoFocus />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" name="email" type="email" placeholder="ada@company.com" value={form.email} onChange={handleChange} autoComplete="email" />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={form.password} onChange={handleChange} autoComplete="new-password" className="pr-10" />
              <button type="button" onClick={() => setShowPassword(p => !p)} aria-label={showPassword ? 'Hide' : 'Show'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={form.password} />
            {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} placeholder="Repeat your password" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" />
            {fieldErrors.confirmPassword && <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>}
          </div>
          <Button type="submit" variant="aria" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating workspace...</> : 'Create Workspace'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">Already have an account?{' '}
          <Link href="/login" className="text-aria-400 hover:text-aria-300 font-medium">Sign in</Link>
        </p>
      </CardFooter>
    </Card>
  );
}
