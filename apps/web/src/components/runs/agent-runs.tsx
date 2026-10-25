import { EmptyState } from '@/components/ui/empty-state';

/**
 * Slot for Milestone 2. Sessions stay in SessionsPanel; queued agent runs land here.
 */
export function AgentRuns() {
  return (
    <section aria-labelledby="agent-runs-title" className="space-y-3">
      <h2 id="agent-runs-title" className="text-lg font-semibold">Queue</h2>
      <EmptyState
        title="No agent runs yet"
        description="When agents start work, each run will show its status, owner, and result here."
      />
    </section>
  );
}
