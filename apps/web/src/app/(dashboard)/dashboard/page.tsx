'use client';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FolderKanban, Ticket, PlayCircle,
  ArrowRight, BrainCircuit, Plus
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-1">
          Good morning, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening in your workspace.</p>
      </div>

      {/* Empty state — first time */}
      <div className="rounded-xl border border-border/60 border-dashed bg-card/30 p-12 flex flex-col items-center justify-center text-center mb-10">
        <div className="h-14 w-14 rounded-full bg-aria-950 border border-aria-800 flex items-center justify-center mb-5">
          <BrainCircuit className="h-7 w-7 text-aria-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Set up your first project</h2>
        <p className="text-muted-foreground text-sm max-w-md mb-6">
          Connect a GitHub repository, let ARIA analyse your codebase, and build your AI engineering team.
          The whole process takes under 5 minutes.
        </p>
        <Link href="/projects">
          <Button variant="aria" className="gap-2">
            <Plus className="h-4 w-4" /> Create Project
          </Button>
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {[
          { icon: FolderKanban, label: 'Projects', value: '0', href: '/projects', cta: 'Create project' },
          { icon: Ticket, label: 'Open Tickets', value: '0', href: '/tickets', cta: 'View tickets' },
          { icon: PlayCircle, label: 'Active Sessions', value: '0', href: '/sessions', cta: 'Start session' },
        ].map(({ icon: Icon, label, value, href, cta }) => (
          <Card key={label} className="border-border/60 bg-card/50 hover:border-aria-800/60 transition-colors group">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-3">{value}</div>
              <Link href={href} className="text-xs text-aria-400 hover:text-aria-300 flex items-center gap-1 group-hover:gap-2 transition-all">
                {cta} <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
