import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

const repoChains = new Map<string, Promise<unknown>>();
const heldWorktrees = new Map<string, { cwd: string; holders: number }>();

function withRepoLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoChains.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tracked: Promise<unknown> = run.then(() => undefined, () => undefined).finally(() => {
    if (repoChains.get(key) === tracked) repoChains.delete(key);
  });
  repoChains.set(key, tracked);
  return run;
}

// ponytail: a dead process's lock file is stolen after 4 minutes, and a waiter
// gives up after 3. A clone longer than that races the next one. Upgrade path:
// refresh the lock mtime while git is running, or a Redis lock.
const LOCK_WAIT_MS = 180_000;
const LOCK_STALE_MS = 240_000;

async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      try {
        return await fn();
      } finally {
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(lockPath);
      } catch { /* the holder removed it */ }
      if (Date.now() - started > LOCK_WAIT_MS) throw new RunError('TIMEOUT', 'repo lock timed out', true);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function gitEnv(token: string | null | undefined, askpass: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/bin',
    HOME: process.env.HOME || '/tmp',
    LANG: process.env.LANG || 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
  if (token && askpass) {
    env.GIT_ASKPASS = askpass;
    env.ARIA_GIT_TOKEN = token;
  }
  return env;
}

async function writeAskpass(): Promise<string> {
  const file = path.join(tmpdir(), `aria-askpass-${randomUUID()}`);
  const script = `#!/bin/sh
case "$1" in
  *[Uu]sername*) printf '%s\\n' 'x-access-token' ;;
  *) printf '%s\\n' "$ARIA_GIT_TOKEN" ;;
esac
`;
  await writeFile(file, script, { mode: 0o700 });
  await chmod(file, 0o700);
  return file;
}

function runGit(args: string[], timeoutMs: number, env: NodeJS.ProcessEnv, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new RunError('TIMEOUT', `git timed out after ${timeoutMs}ms`, true));
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') reject(new RunError('RUN_ERROR', 'git is not installed in the runtime image', true));
      else reject(new RunError('REPO_ACCESS', err.message, false));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new RunError('REPO_ACCESS', stderr.slice(0, 300) || `git exit ${code ?? 0}`, false));
    });
  });
}

async function stripCursorHooks(dir: string): Promise<void> {
  for (const name of ['hooks.json', 'mcp.json', 'environment.json']) {
    await rm(path.join(dir, '.cursor', name), { force: true });
  }
}

async function removeWorktree(work: string): Promise<void> {
  let mirror: string | null = null;
  try {
    const text = await readFile(path.join(work, '.git'), 'utf8');
    const match = text.match(/gitdir:\s*(.+)/);
    if (match?.[1]) mirror = path.resolve(path.dirname(match[1].trim()), '..', '..');
  } catch { /* already gone, or this was not a worktree */ }
  if (mirror) {
    try {
      await runGit(['-C', mirror, 'worktree', 'remove', '--force', work], 20_000, gitEnv(null, null));
      return;
    } catch { /* the mirror may already be gone */ }
  }
  await rm(work, { recursive: true, force: true });
  if (mirror) {
    try { await runGit(['-C', mirror, 'worktree', 'prune'], 20_000, gitEnv(null, null)); } catch { /* mirror is gone */ }
  }
}

export async function releasePlannerWorktree(cwd: string): Promise<void> {
  if (!cwd || path.basename(cwd) === 'planner-cwd') return;
  for (const [key, slot] of heldWorktrees) {
    if (slot.cwd !== cwd) continue;
    slot.holders -= 1;
    if (slot.holders > 0) return;
    heldWorktrees.delete(key);
    break;
  }
  await removeWorktree(cwd);
}

export async function plannerCwd(input: {
  stub: boolean;
  repoUrl?: string | null;
  githubToken?: string | null;
  tools?: 'read_only' | 'none';
  reuseKey?: string;
}): Promise<string> {
  const env = validateEnv();
  const data = env.ARIA_DATA_DIR || '/tmp/aria-data';
  if (input.stub || !input.repoUrl || input.tools === 'none') {
    const cwd = path.join(data, 'planner-cwd');
    await mkdir(cwd, { recursive: true });
    return cwd;
  }
  if (input.reuseKey) {
    const existing = heldWorktrees.get(input.reuseKey);
    if (existing) {
      existing.holders += 1;
      return existing.cwd;
    }
  }
  const hash = createHash('sha256').update(input.repoUrl).digest('hex').slice(0, 16);
  const root = path.join(data, 'repos', hash);
  await mkdir(root, { recursive: true });
  const cwd = await withRepoLock(hash, () => withFileLock(path.join(root, 'checkout.lock'), async () => {
    const mirror = path.join(root, 'mirror');
    let askpass: string | null = null;
    try {
      if (input.githubToken) askpass = await writeAskpass();
      const gitProcessEnv = gitEnv(input.githubToken, askpass);
      if (!existsSync(path.join(mirror, '.git')) && !existsSync(path.join(mirror, 'HEAD'))) {
        await runGit(['clone', '--filter=blob:none', '--depth', '1', input.repoUrl as string, mirror], 60_000, gitProcessEnv);
      } else {
        await runGit(['-C', mirror, 'fetch', '--depth', '1', 'origin'], 60_000, gitProcessEnv);
        await runGit(['-C', mirror, 'checkout', '--detach', 'FETCH_HEAD'], 20_000, gitProcessEnv);
      }
      const work = path.join(root, 'worktrees', randomUUID());
      await mkdir(path.dirname(work), { recursive: true });
      await runGit(['-C', mirror, 'worktree', 'add', '--detach', work, 'HEAD'], 20_000, gitProcessEnv);
      await stripCursorHooks(work);
      return work;
    } finally {
      if (askpass) await rm(askpass, { force: true });
    }
  }));
  heldWorktrees.set(input.reuseKey ?? cwd, { cwd, holders: 1 });
  return cwd;
}

function killGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

function invalidKey(message: string): boolean {
  return /invalid user api key/i.test(message);
}

export function runLocalAgent(input: {
  prompt: string;
  stub: boolean;
  timeoutMs: number;
  apiKey: string;
  modelId?: string;
  tools?: 'read_only' | 'none';
  repoUrl?: string | null;
  githubToken?: string | null;
  cwd?: string;
}): Promise<LocalRun> {
  const env = scrubbedEnv(input.apiKey);
  mkdirSync(env.HOME || '/tmp', { recursive: true });
  const ready = input.cwd
    ? Promise.resolve({ cwd: input.cwd, owned: false })
    : plannerCwd({
      stub: input.stub,
      repoUrl: input.repoUrl,
      githubToken: input.githubToken,
      tools: input.tools,
    }).then((cwd) => ({ cwd, owned: true }));
  return ready.then(({ cwd, owned }) => new Promise((resolve, reject) => {
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
      killGroup(child);
      const released = owned ? releasePlannerWorktree(cwd) : Promise.resolve();
      void released.catch(() => undefined).then(fn);
    };
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      finish(() => reject(new RunError('TIMEOUT', 'Local agent exceeded its wall clock', true)));
    }, input.timeoutMs);
    child.on('message', (message: { type?: string; text?: string; envKeys?: string[]; error?: string; usage?: { total?: number } }) => {
      if (message?.type === 'result') finish(() => resolve({ text: message.text || '', envKeys: message.envKeys || [], usage: message.usage }));
      if (message?.type === 'error') {
        const text = message.error || 'child error';
        const invalid = invalidKey(text);
        finish(() => reject(new RunError(invalid ? 'KEY_INVALID' : 'RUN_ERROR', text, !invalid)));
      }
    });
    child.on('exit', (code) => {
      const text = stderr.slice(0, 300) || `child exit ${code ?? 0} without a result`;
      const invalid = invalidKey(text);
      finish(() => reject(new RunError(invalid ? 'KEY_INVALID' : 'RUN_ERROR', text, !invalid)));
    });
    child.send({
      type: 'start',
      prompt: input.prompt,
      stub: input.stub,
      modelId: input.modelId,
      tools: input.tools ?? 'read_only',
      cwd,
    });
  }));
}
