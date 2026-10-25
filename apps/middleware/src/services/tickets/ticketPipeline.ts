export const PIPELINE_STATUSES = [
  'backlog',
  'ready_for_dev',
  'in_progress',
  'ready_for_qa',
  'in_qa',
  'ready_for_review',
  'awaiting_merge',
  'blocked',
  'done',
  'rejected',
] as const;

export type PipelineStatus = typeof PIPELINE_STATUSES[number];

export const PIPELINE_EVENTS = [
  'approve',
  'dispatch',
  'pr_opened',
  'dev_failed',
  'review_passed',
  'review_changes',
  'qa_passed',
  'qa_failed',
  'fix_done',
  'pr_merged',
  'pr_closed',
  'unblock',
  'reject',
] as const;

export type PipelineEvent = typeof PIPELINE_EVENTS[number];

export type ActivityName = 'develop' | 'review' | 'fix' | 'qa';

export type PipelineEffect =
  | { type: 'enqueue'; activity: ActivityName; returnTo?: 'review' | 'qa' }
  | { type: 'cancelRuns' }
  | { type: 'emit'; name: string };

const AGENT_OWNED = new Set<PipelineStatus>(['in_progress', 'ready_for_review', 'in_qa', 'awaiting_merge']);

export function humanMaySetStatus(to: PipelineStatus): boolean {
  return !AGENT_OWNED.has(to);
}

export interface TransitionContext {
  reviewRounds: number;
  qaRounds: number;
  maxReviewRounds: number;
  maxQaRounds: number;
  returnTo?: 'review' | 'qa';
}

export interface Transition {
  status: PipelineStatus;
  effects: PipelineEffect[];
  reason?: string;
}

function fixOrBlock(rounds: number, max: number, returnTo: 'review' | 'qa'): Transition {
  if (rounds < max) {
    return {
      status: 'in_progress',
      effects: [{ type: 'enqueue', activity: 'fix', returnTo }],
      reason: `${returnTo} fix round ${rounds + 1}`,
    };
  }
  return { status: 'blocked', effects: [], reason: `${returnTo} fix rounds exhausted` };
}

export function transition(status: PipelineStatus, event: PipelineEvent, ctx: TransitionContext): Transition {
  switch (event) {
    case 'approve':
      if (status !== 'backlog') return { status, effects: [], reason: 'approve only leaves backlog' };
      return { status: 'ready_for_dev', effects: [{ type: 'emit', name: 'approved' }] };
    case 'dispatch':
      if (status !== 'ready_for_dev') return { status, effects: [], reason: 'dispatch only leaves ready_for_dev' };
      return { status: 'in_progress', effects: [{ type: 'enqueue', activity: 'develop' }] };
    case 'pr_opened':
      if (status !== 'in_progress') return { status, effects: [], reason: 'pr_opened only leaves in_progress' };
      return { status: 'ready_for_review', effects: [{ type: 'enqueue', activity: 'review' }] };
    case 'dev_failed':
      if (status !== 'in_progress') return { status, effects: [], reason: 'dev_failed only leaves in_progress' };
      return { status: 'blocked', effects: [], reason: 'develop failed' };
    case 'review_passed':
      if (status !== 'ready_for_review') return { status, effects: [], reason: 'review_passed only leaves ready_for_review' };
      return { status: 'in_qa', effects: [{ type: 'enqueue', activity: 'qa' }] };
    case 'review_changes':
      if (status !== 'ready_for_review') return { status, effects: [], reason: 'review_changes only leaves ready_for_review' };
      return fixOrBlock(ctx.reviewRounds, ctx.maxReviewRounds, 'review');
    case 'qa_passed':
      if (status !== 'in_qa') return { status, effects: [], reason: 'qa_passed only leaves in_qa' };
      return { status: 'awaiting_merge', effects: [{ type: 'emit', name: 'ready_for_owner_merge' }] };
    case 'qa_failed':
      if (status !== 'in_qa') return { status, effects: [], reason: 'qa_failed only leaves in_qa' };
      return fixOrBlock(ctx.qaRounds, ctx.maxQaRounds, 'qa');
    case 'fix_done':
      if (status !== 'in_progress') return { status, effects: [], reason: 'fix_done only leaves in_progress' };
      if (ctx.returnTo === 'qa') return { status: 'in_qa', effects: [{ type: 'enqueue', activity: 'qa' }] };
      return { status: 'ready_for_review', effects: [{ type: 'enqueue', activity: 'review' }] };
    case 'pr_merged':
      if (status !== 'awaiting_merge' && status !== 'in_qa' && status !== 'ready_for_review' && status !== 'in_progress') {
        return { status, effects: [], reason: 'pr_merged only leaves an open pull' };
      }
      return { status: 'done', effects: [{ type: 'cancelRuns' }, { type: 'emit', name: 'done' }] };
    case 'pr_closed':
      if (status === 'done' || status === 'rejected' || status === 'backlog') {
        return { status, effects: [], reason: 'pr_closed does not apply' };
      }
      return { status: 'rejected', effects: [{ type: 'cancelRuns' }] };
    case 'unblock':
      if (status !== 'blocked') return { status, effects: [], reason: 'unblock only leaves blocked' };
      return { status: 'ready_for_dev', effects: [] };
    case 'reject':
      if (status === 'done' || status === 'rejected') return { status, effects: [], reason: 'reject does not leave a terminal ticket' };
      return { status: 'rejected', effects: [{ type: 'cancelRuns' }] };
    default: {
      const neverEvent: never = event;
      throw new Error(`Unknown pipeline event ${String(neverEvent)}`);
    }
  }
}
