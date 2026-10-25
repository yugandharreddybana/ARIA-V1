export const RUN_ERROR_CODES = [
  'KEY_INVALID',
  'RATE_LIMITED',
  'USAGE_LIMIT',
  'NETWORK',
  'REPO_ACCESS',
  'MODEL_UNAVAILABLE',
  'SCHEMA_INVALID',
  'NO_CHANGES',
  'BUDGET_EXCEEDED',
  'RUN_ERROR',
  'RUN_EXPIRED',
  'TIMEOUT',
  'MERGE_GUARD',
  'CANCELLED',
] as const;

export type RunErrorCode = typeof RUN_ERROR_CODES[number];

export class RunError extends Error {
  constructor(
    readonly code: RunErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

export class LeaseLost extends Error {
  constructor() {
    super('The worker lost the run lease');
    this.name = 'LeaseLost';
  }
}

export function asRunError(err: unknown): RunError {
  if (err instanceof RunError) return err;
  const message = err instanceof Error ? err.message : 'Run failed';
  return new RunError('RUN_ERROR', message, true);
}

export function retryable(code: RunErrorCode): boolean {
  switch (code) {
    case 'RATE_LIMITED':
    case 'NETWORK':
    case 'RUN_ERROR':
    case 'RUN_EXPIRED':
    case 'TIMEOUT':
      return true;
    case 'KEY_INVALID':
    case 'USAGE_LIMIT':
    case 'REPO_ACCESS':
    case 'MODEL_UNAVAILABLE':
    case 'SCHEMA_INVALID':
    case 'NO_CHANGES':
    case 'BUDGET_EXCEEDED':
    case 'MERGE_GUARD':
    case 'CANCELLED':
      return false;
    default: {
      const neverCode: never = code;
      throw new Error(`Unknown run error ${String(neverCode)}`);
    }
  }
}
