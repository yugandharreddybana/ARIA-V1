'use client';

import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AgentRuns } from '@/components/runs/agent-runs';
import { SessionsPanel } from '@/components/runs/sessions-panel';
import { LoadingState } from '@/components/ui/empty-state';
import Link from 'next/link';

export default function RunsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-4 md:p-8">
      <PageHeader
        title="Runs"
        description="What the company is doing. Agent runs queue here. Sessions are the work cycles you start today."
        action={<Link href="/system-health" className="text-sm text-primary">System health</Link>}
      />
      <Suspense fallback={<LoadingState label="Loading the queue…" />}>
        <AgentRuns />
      </Suspense>
      <SessionsPanel />
    </div>
  );
}
