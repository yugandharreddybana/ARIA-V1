/**
 * Shared CodeWorker for CLI coding agents (Claude Code, Codex, Antigravity).
 * Live mode shells out; stub/mock mode hits the provider stub HTTP surface so CI stays green.
 */
import { spawn } from 'node:child_process';
import { validateEnv } from '../../config/env';
import { RunError } from '../runs/errors';
import type { CodeWorker, CodeTask, ExternalRef, CodeRunSnapshot, TokenUsage, CloudAuth } from '../models/codeWorker';
import { cursorCloudWorker } from '../models/codeWorker';

export type CliKind = 'claude_cli' | 'codex_cli' | 'antigravity_cli';

const BINARIES: Record<CliKind, string> = {
  claude_cli: 'claude',
  codex_cli: 'codex',
  antigravity_cli: 'agy',
};

function stubMode(): boolean {
  return validateEnv().ARIA_CURSOR_LOCAL_MODE === 'stub'
    || (process.env.ARIA_LLM_MODE === 'mock' && process.env.NODE_ENV !== 'production');
}

/** In CI/stub, reuse Cursor cloud worker against the provider stub (same contract). */
export function cliCodeWorker(kind: CliKind): CodeWorker {
  if (stubMode()) return cursorCloudWorker();

  const binary = BINARIES[kind];
  return {
    async start(task: CodeTask): Promise<ExternalRef> {
      const agentId = `${kind}-${task.run.id}`;
      const runId = `run-${task.run.id}`;
      // Fire-and-forget CLI process; follow() polls process exit via a marker file / stub later.
      const child = spawn(binary, cliArgs(kind, task), {
        env: { ...process.env, ...cliEnv(kind, task.apiKey) },
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      if (child.pid == null) throw new RunError('RUN_ERROR', `Failed to start ${binary}`, false);
      return { agentId, runId, url: undefined };
    },
    async follow(ref, _cursor, onEvent): Promise<CodeRunSnapshot> {
      onEvent('status', `${binary} follow shim (live CLI)`, null);
      // ponytail: live CLI follow is a thin status shim until M3D orchestration polls agents. Ceiling: no stdout stream.
      return {
        status: 'finished',
        resultText: `${binary} completed`,
        branches: [],
      };
    },
    async usage(): Promise<TokenUsage | null> {
      return { unavailable: true };
    },
    async cancel(): Promise<void> {
      // CLI cancel is best-effort; process group kill lands with M3D.
    },
  };
}

function cliArgs(kind: CliKind, task: CodeTask): string[] {
  switch (kind) {
    case 'claude_cli':
      return ['-p', task.prompt, '--output-format', 'text'];
    case 'codex_cli':
      return ['exec', task.prompt];
    case 'antigravity_cli':
      return ['-p', task.prompt, '--output-format', 'text'];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function cliEnv(kind: CliKind, apiKey: string): Record<string, string> {
  switch (kind) {
    case 'claude_cli':
      return { ANTHROPIC_API_KEY: apiKey };
    case 'codex_cli':
      return { CODEX_API_KEY: apiKey, OPENAI_API_KEY: apiKey };
    case 'antigravity_cli':
      return { GEMINI_API_KEY: apiKey };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export type { CloudAuth };
