/**
 * Shared CodeWorker for CLI coding agents (Claude Code, Codex, Antigravity).
 * Stub/mock mode reuses the Cursor cloud worker against the provider stub.
 * Live mode spawns the real CLI, waits for exit, and maps the exit code.
 */
import { spawn, type ChildProcess } from 'node:child_process';
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

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

interface TrackedChild {
  child: ChildProcess;
  stdout: string;
  stderr: string;
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  timeoutMs: number;
}

/** In-process registry so follow()/cancel() can wait on the child start() spawned. */
const tracked = new Map<string, TrackedChild>();

function trackKey(ref: ExternalRef): string {
  return `${ref.agentId}:${ref.runId}`;
}

export function clearTrackedCliChildren(): void {
  for (const entry of tracked.values()) {
    try { entry.child.kill('SIGKILL'); } catch { /* already dead */ }
  }
  tracked.clear();
}

function stubMode(): boolean {
  return validateEnv().ARIA_CURSOR_LOCAL_MODE === 'stub'
    || (process.env.ARIA_LLM_MODE === 'mock' && process.env.NODE_ENV !== 'production');
}

export interface CliWorkerOptions {
  /** Override binary path (tests inject `process.execPath`). */
  binary?: string;
  /** Override argv builder (tests inject `-e` scripts). */
  argsFor?: (task: CodeTask) => string[];
  envFor?: (apiKey: string) => Record<string, string>;
  timeoutMs?: number;
  /** Force the live CLI path even when ARIA_CURSOR_LOCAL_MODE=stub. */
  forceLive?: boolean;
  spawnImpl?: typeof spawn;
}

/** Build a CodeWorker that tracks the child process through follow()/cancel(). */
export function createCliCodeWorker(options: CliWorkerOptions & { binary: string; argsFor: (task: CodeTask) => string[] }): CodeWorker {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnImpl = options.spawnImpl ?? spawn;
  const envFor = options.envFor ?? (() => ({}));

  return {
    async start(task: CodeTask): Promise<ExternalRef> {
      const agentId = `cli-${task.run.id}`;
      const runId = `run-${task.run.id}`;
      const child = spawnImpl(options.binary, options.argsFor(task), {
        env: { ...process.env, ...envFor(task.apiKey) },
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (child.pid == null) throw new RunError('RUN_ERROR', `Failed to start ${options.binary}`, false);

      const entry: TrackedChild = {
        child,
        stdout: '',
        stderr: '',
        timeoutMs,
        exit: new Promise((resolve) => {
          child.on('error', (err) => {
            entry.stderr += `${err.message}\n`;
            resolve({ code: 1, signal: null });
          });
          child.on('close', (code, signal) => resolve({ code, signal }));
        }),
      };
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => { entry.stdout += chunk; });
      child.stderr?.on('data', (chunk: string) => { entry.stderr += chunk; });
      tracked.set(trackKey({ agentId, runId }), entry);
      return { agentId, runId, url: undefined };
    },

    async follow(ref, _cursor, onEvent, _auth): Promise<CodeRunSnapshot> {
      const entry = tracked.get(trackKey(ref));
      if (!entry) {
        throw new RunError('RUN_ERROR', `No tracked CLI process for ${ref.agentId}`, false);
      }
      onEvent('status', `waiting for ${options.binary}`, null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), entry.timeoutMs);
      });
      const outcome = await Promise.race([
        entry.exit.then((result) => ({ kind: 'exit' as const, ...result })),
        timedOut.then(() => ({ kind: 'timeout' as const })),
      ]);
      if (timer) clearTimeout(timer);

      if (outcome.kind === 'timeout') {
        try { entry.child.kill('SIGKILL'); } catch { /* ignore */ }
        tracked.delete(trackKey(ref));
        onEvent('error', `${options.binary} timed out after ${entry.timeoutMs}ms`, null);
        return {
          status: 'error',
          resultText: [entry.stdout, entry.stderr, `timeout after ${entry.timeoutMs}ms`].filter(Boolean).join('\n'),
          branches: [],
        };
      }

      tracked.delete(trackKey(ref));
      const log = [entry.stdout, entry.stderr].filter(Boolean).join('\n');
      if (outcome.code === 0) {
        onEvent('status', `${options.binary} exited 0`, null);
        if (log) onEvent('assistant', log.slice(0, 8_000), null);
        return { status: 'finished', resultText: log || `${options.binary} completed`, branches: [] };
      }
      onEvent('error', `${options.binary} exited ${outcome.code ?? outcome.signal}`, null);
      if (log) onEvent('assistant', log.slice(0, 8_000), null);
      return {
        status: 'error',
        resultText: log || `${options.binary} failed with code ${outcome.code ?? outcome.signal}`,
        branches: [],
      };
    },

    async usage(_ref, _apiKey): Promise<TokenUsage | null> {
      return { unavailable: true };
    },

    async cancel(ref, _apiKey): Promise<void> {
      const entry = tracked.get(trackKey(ref));
      if (!entry) return;
      try { entry.child.kill('SIGTERM'); } catch { /* ignore */ }
      tracked.delete(trackKey(ref));
    },
  };
}

/** In CI/stub, reuse Cursor cloud worker against the provider stub. Live mode runs the real CLI. */
export function cliCodeWorker(kind: CliKind, options: CliWorkerOptions = {}): CodeWorker {
  if (!options.forceLive && stubMode()) return cursorCloudWorker();

  const binary = options.binary ?? BINARIES[kind];
  return createCliCodeWorker({
    binary,
    argsFor: options.argsFor ?? ((task) => cliArgs(kind, task)),
    envFor: options.envFor ?? ((apiKey) => cliEnv(kind, apiKey)),
    timeoutMs: options.timeoutMs,
    spawnImpl: options.spawnImpl,
  });
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
