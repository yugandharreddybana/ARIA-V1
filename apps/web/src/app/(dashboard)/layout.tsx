'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import {
  BrainCircuit, LayoutDashboard, FolderKanban,
  Users, Ticket, Lightbulb, PlayCircle,
  Bot, Settings, LogOut, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionStatus } from '@/components/SessionStatus';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/dashboard/team', icon: Users, label: 'Skills & Teams' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/planning', icon: Lightbulb, label: 'Planning' },
  { href: '/sessions', icon: PlayCircle, label: 'Sessions' },
  { href: '/ai-strategy', icon: Bot, label: 'AI Strategy' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-aria-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 border-r border-border/50 flex flex-col bg-card/30 fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-border/50">
          <BrainCircuit className="h-5 w-5 text-aria-500" />
          <span className="font-bold tracking-tight">ARIA</span>
          <span className="text-xs text-muted-foreground ml-auto">v0.1</span>
        </div>

        <div className="px-3 pt-3">
          <SessionStatus />
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-aria-900/60 text-aria-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/50 p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <div className="h-7 w-7 rounded-full bg-aria-800 flex items-center justify-center text-xs font-bold text-aria-200 flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={logout} title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}
