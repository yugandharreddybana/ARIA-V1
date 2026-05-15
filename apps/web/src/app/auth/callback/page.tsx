'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth.context';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { setToken } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');
    if (token) {
      setToken(token);
      router.replace('/dashboard');
    } else {
      router.replace(`/login?error=${error ?? 'unknown'}`);
    }
  }, [params, router, setToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-aria-400" />
        <p className="text-sm">Completing sign in…</p>
      </div>
    </div>
  );
}
