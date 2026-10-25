'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import { Button } from '@/components/ui/button';
import { SessionStatus } from '@/components/SessionStatus';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/empty-state';

const NAV_ITEMS = [
  { href: '/projects', label: 'Projects' },
  { href: '/company', label: 'Company' },
  { href: '/board', label: 'Board' },
  { href: '/runs', label: 'Runs' },
  { href: '/settings', label: 'Settings' },
];

function isActive(href: string, pathname: string) {
  if (href === '/projects') {
    return pathname === '/projects' || (pathname.startsWith('/projects/') && !pathname.includes('/company'));
  }
  if (href === '/company') return pathname === '/company' || pathname.includes('/company');
  if (href === '/board') return pathname === '/board' || pathname === '/tickets';
  if (href === '/runs') return pathname === '/runs' || pathname === '/sessions';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="Loading your workspace…" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-background">
      {navOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-60 flex-col border-r bg-card',
        navOpen ? 'flex' : 'hidden',
        'md:flex',
      )}>
        <div className="flex h-14 items-center px-5">
          <Link href="/projects" className="text-sm font-semibold tracking-tight">ARIA</Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm',
                  active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t p-3">
          <SessionStatus />
          <ThemeToggle compact />
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} title="Sign out">
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen flex-1 md:ml-60">
        <div className="flex h-12 items-center border-b px-3 md:hidden">
          <Button type="button" variant="ghost" size="sm" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
            Menu
          </Button>
          <span className="ml-2 text-sm font-semibold">ARIA</span>
        </div>
        {children}
      </main>
    </div>
  );
}
