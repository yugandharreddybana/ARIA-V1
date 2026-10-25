'use client';

import { PageHeader } from '@/components/ui/page-header';
import { AgentRuns } from '@/components/runs/agent-runs';
import { SessionsPanel } from '@/components/runs/sessions-panel';
import Link from 'next/link';

export default function RunsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 p-4 md:p-8">
      <PageHeader
        title="Runs"
        description="What the company is doing. Agent runs will queue here. Sessions are the work cycles you start today."
        action={<Link href="/system-health" className="text-sm text-primary">System health</Link>}
      />
      <AgentRuns />
      <SessionsPanel />
    </div>
  );
}
