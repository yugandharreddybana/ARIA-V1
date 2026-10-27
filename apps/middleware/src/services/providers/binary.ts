import { spawnSync } from 'node:child_process';
import type { BinaryProbe, ProviderAdapter } from './types';

/** Detect a CLI binary without auto-installing. */
export function detectBinary(binary: string | undefined, installSteps: string[]): BinaryProbe {
  if (!binary) return { status: 'not_required', installSteps: [] };
  if (process.env.ARIA_LLM_MODE === 'mock' && process.env.NODE_ENV !== 'production') {
    return { status: 'ok', binary, installSteps };
  }
  // ponytail: which/whereis only — no package manager install. Ceiling: Windows PATH quirks → use `where` later.
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [binary], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (probe.status === 0 && (probe.stdout || '').trim()) {
    return { status: 'ok', binary, installSteps };
  }
  return { status: 'missing', binary, installSteps };
}

export function adapterBinaryProbe(adapter: ProviderAdapter): Promise<BinaryProbe> {
  return Promise.resolve(detectBinary(adapter.binary, adapter.installSteps));
}
