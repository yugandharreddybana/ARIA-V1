/**
 * Runs inside the middleware image. Proves git is installed, the compiled
 * planner child answers a stub plan, then exits and leaves no child behind.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const childPath = '/repo/apps/middleware/dist/services/models/localAgentChild.js';

function childPids() {
  return readdirSync('/proc').filter((name) => /^\d+$/.test(name)).filter((pid) => {
    try {
      return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('localAgentChild');
    } catch {
      return false;
    }
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk) => { out += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(out || `${command} exited ${code ?? 0}`));
    });
  });
}

const version = await run('git', ['--version']);
if (!/git version/.test(version)) throw new Error(`git is missing from the runtime image: ${version}`);

const before = childPids();
const child = spawn(process.execPath, [childPath], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
const message = await new Promise((resolve, reject) => {
  let settled = false;
  const finish = (fn) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };
  const timer = setTimeout(() => finish(() => reject(new Error('planner child timed out'))), 20_000);
  child.on('message', (payload) => finish(() => resolve(payload)));
  child.on('error', (err) => finish(() => reject(err)));
  child.on('exit', (code) => finish(() => reject(new Error(`planner child exited ${code ?? 0} before replying`))));
  child.send({ type: 'start', prompt: 'Estimate story points', stub: true, tools: 'none', cwd: '/tmp' });
});

if (!String(message?.text).includes('"storyPoints":5')) {
  throw new Error(`planner child returned ${JSON.stringify(message)}`);
}

await new Promise((resolve) => setTimeout(resolve, 300));
if (child.pid) {
  try {
    process.kill(child.pid, 0);
    throw new Error('planner child is still running');
  } catch (err) {
    if (err instanceof Error && err.message === 'planner child is still running') throw err;
  }
}
const leftover = childPids().filter((pid) => !before.includes(pid));
if (leftover.length) throw new Error(`planner children still in /proc: ${leftover.join(',')}`);
process.stdout.write('planner smoke ok\n');
