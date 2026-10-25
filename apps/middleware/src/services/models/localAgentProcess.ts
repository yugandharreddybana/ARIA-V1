import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { validateEnv } from '../../config/env';
import { RunError } from '../runs/errors';

export interface LocalRun {
  text: string;
  envKeys: string[];
  usage?: { total?: number };
}

export function scrubbedEnv(apiKey: string): NodeJS.ProcessEnv {
  const env = validateEnv();
  const home = path.join(env.ARIA_DATA_DIR || '/tmp/aria-data', 'cursor-home');
  return {
    PATH: process.env.PATH || '/usr/bin',
    HOME: home,
    LANG: process.env.LANG || 'C.UTF-8',
    CURSOR_API_KEY: apiKey,
  };
}

export function childArgs(): string[] {
  const ts = path.join(__dirname, 'localAgentChild.ts');
  const js = path.join(__dirname, 'localAgentChild.js');
  if (existsSync(ts)) return ['--experimental-strip-types', ts];
  if (existsSync(js)) return [js];
  throw new RunError('RUN_ERROR', 'local agent child is missing from the build', false);
}

export function plannerCwd(input: { stub: boolean; repoUrl?: string | null }): string {
  const env = validateEnv();
  const data = env.ARIA_DATA_DIR || '/tmp/aria-data';
  if (input.stub || !input.repoUrl) {
    const cwd = path.join(data, 'planner-cwd');
    mkdirSync(cwd, { recursive: true });
    return cwd;
  }
  const root = path.join(data, 'repos');
  const dir = path.join(root, createHash('sha256').update(input.repoUrl).digest('hex').slice(0, 16));
  mkdirSync(root, { recursive: true });
  if (!existsSync(path.join(dir, '.git'))) {
    execFileSync('git', ['clone', '--filter=blob:none', '--depth', '1', input.repoUrl, dir], { timeout: 60_000 });
  } else {
    execFileSync('git', ['-C', dir, 'fetch', '--depth', '1', 'origin'], { timeout: 60_000 });
    execFileSync('git', ['-C', dir, 'checkout', '--detach', 'FETCH_HEAD'], { timeout: 20_000 });
  }
  return dir;
}

function killGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

export function runLocalAgent(input: {
  prompt: string;
  stub: boolean;
  timeoutMs: number;
  apiKey: string;
  modelId?: string;
  tools?: 'read_only' | 'none';
  repoUrl?: string | null;
}): Promise<LocalRun> {
  const env = scrubbedEnv(input.apiKey);
  const cwd = plannerCwd({ stub: input.stub, repoUrl: input.repoUrl });
  mkdirSync(env.HOME || cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, childArgs(), {
      env,
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      killGroup(child);
      finish(() => reject(new RunError('TIMEOUT', 'Local agent exceeded its wall clock', true)));
    }, input.timeoutMs);
    child.on('message', (message: { type?: string; text?: string; envKeys?: string[]; error?: string; usage?: { total?: number } }) => {
      if (message?.type === 'result') finish(() => resolve({ text: message.text || '', envKeys: message.envKeys || [], usage: message.usage }));
      if (message?.type === 'error') finish(() => reject(new RunError('RUN_ERROR', message.error || 'child error', true)));
    });
    child.on('exit', (code) => {
      finish(() => reject(new RunError('RUN_ERROR', stderr.slice(0, 300) || `child exit ${code ?? 0} without a result`, true)));
    });
    child.send({
      type: 'start',
      prompt: input.prompt,
      stub: input.stub,
      modelId: input.modelId,
      tools: input.tools ?? 'read_only',
      cwd,
    });
  });
}
