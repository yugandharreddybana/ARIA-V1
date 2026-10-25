import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { validateEnv } from '../../config/env';
import { RunError } from '../runs/errors';

export interface LocalRun {
  text: string;
  envKeys: string[];
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

export function runLocalAgent(input: {
  prompt: string;
  stub: boolean;
  timeoutMs: number;
  apiKey: string;
  modelId?: string;
  tools?: 'read_only' | 'none';
}): Promise<LocalRun> {
  const childPath = path.join(__dirname, 'localAgentChild.ts');
  const env = scrubbedEnv(input.apiKey);
  const cwd = path.join(env.HOME || '/tmp/aria-data', 'planner-cwd');
  mkdirSync(cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, ['--experimental-strip-types', childPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new RunError('TIMEOUT', 'Local agent exceeded its wall clock', true));
    }, input.timeoutMs);
    child.on('message', (message: { type?: string; text?: string; envKeys?: string[]; error?: string }) => {
      if (message?.type === 'result') {
        clearTimeout(timer);
        resolve({ text: message.text || '', envKeys: message.envKeys || [] });
      }
      if (message?.type === 'error') {
        clearTimeout(timer);
        reject(new RunError('RUN_ERROR', message.error || 'child error', true));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code && code !== 0) reject(new RunError('RUN_ERROR', stderr.slice(0, 300) || `child exit ${code}`, true));
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
