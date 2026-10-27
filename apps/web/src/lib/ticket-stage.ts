import type { TicketStatus } from '@aria/shared';

export function stageLabel(status: TicketStatus): string {
  switch (status) {
    case 'backlog': return 'Backlog';
    case 'ready_for_dev': return 'Ready';
    case 'in_progress': return 'Develop';
    case 'ready_for_review': return 'Review';
    case 'in_qa': return 'QA';
    case 'ready_for_qa': return 'Ready for QA';
    case 'awaiting_merge': return 'Awaiting merge';
    case 'blocked': return 'Blocked';
    case 'done': return 'Done';
    case 'rejected': return 'Rejected';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

export function scheduleTone(state: string | undefined): 'warn' | 'neutral' | 'ok' {
  if (state === 'overdue' || state === 'at_risk') return 'warn';
  if (state === 'on_track' || state === 'done') return 'ok';
  return 'neutral';
}
