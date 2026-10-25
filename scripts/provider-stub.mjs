#!/usr/bin/env node
/**
 * Local stand-in for Cursor and GitHub. Bind is 127.0.0.1.
 * `node scripts/provider-stub.mjs` listens. Tests call startStub({ port }).
 */
import http from 'node:http';

const FILES = {
  'package.json': JSON.stringify({ dependencies: { next: '14.2.4', react: '18.3.1', express: '4.19.2', pg: '8.12.0' } }),
  'apps/web/src/app/page.tsx': 'export default function Page() { return null; }\n',
  'apps/web/src/app/(auth)/login/page.tsx': 'export default function Login() { return null; }\n',
  'apps/web/src/app/(auth)/signup/page.tsx': 'export default function Signup() { return null; }\n',
  'apps/middleware/src/routes/auth.routes.ts': 'export const authRoutes = true;\n',
  'packages/db/src/schema/projects.ts': "export const projects = pgTable('projects', { id: text('id') });\n",
  'packages/db/flyway/migrations/V1__init.sql': 'CREATE TABLE IF NOT EXISTS users (id uuid primary key);\n',
};

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const agents = new Map();
const pulls = new Map();
let violations = 0;
let prSeq = 1;

function marker(prompt, name) {
  const match = String(prompt || '').match(new RegExp(`\\[\\[stub:${name}(?:=([^\\]]+))?\\]\\]`));
  return match ? (match[1] ?? '1') : null;
}

function scenario(prompt) {
  if (marker(prompt, 'error')) return 'error';
  if (marker(prompt, 'no_pr')) return 'no_pr';
  if (marker(prompt, 'no_changes')) return 'no_changes';
  if (marker(prompt, 'stream_410')) return 'stream_410';
  if (marker(prompt, 'slow')) return 'slow';
  if (marker(prompt, 'repo_access')) return 'repo_access';
  return 'ok';
}

function devReport(prompt) {
  if (!prompt.includes('## Commands') || marker(prompt, 'no_report')) return '';
  return [
    '## Commands',
    'build: pnpm -F @aria/middleware typecheck',
    'unit: pnpm -F @aria/middleware test',
    'integration: pnpm -F @aria/middleware test',
    'e2e: playwright test',
    '## Before',
    'unit failed on the missing guard',
    '## After',
    'unit passed after the change',
    '## Screenshots',
    prompt.includes('ui_affected: yes') ? `ui_affected: yes\n![before](${PNG})\n![after](${PNG})` : 'ui_affected: no\nNo UI was touched.',
    '## Logs',
    'before: 1 failed. after: 0 failed.',
    '## Summary',
    'The change closes the ticket. It was required so the gate can see a local before/after result.',
  ].join('\n');
}

function qaReport(prompt) {
  if (!prompt.includes('## Previous behaviour') || marker(prompt, 'no_report')) return '';
  return [
    '## Previous behaviour',
    'The screen rejected a valid move.',
    '## Current behaviour',
    'The screen accepts the move.',
    '## Diff',
    'apps/middleware/src/services/tickets/ticketPipeline.ts — added the transition.',
    '## Scenarios',
    'happy path: pass',
    '## Regression',
    'pnpm test: pass',
    '## Screenshots',
    prompt.toLowerCase().includes('ui_affected: yes') ? `ui_affected: yes\n![before](${PNG})\n![after](${PNG})` : 'ui_affected: no\nNo UI was touched.',
    '## Verdict',
    'pass',
  ].join('\n');
}

function resultText(prompt) {
  return `${devReport(prompt)}\n${qaReport(prompt)}`.trim();
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', 'content-length': payload.length, ...headers });
  res.end(payload);
}

function pullKey(owner, repo, number) {
  return `${owner}/${repo}#${number}`;
}

export function startStub({ port = 0 } = {}) {
  violations = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw || '{}') : {};
      if (path === '/v1/me') return send(res, 200, { apiKeyName: 'stub' });
      if (path === '/v1/models') {
        return send(res, 200, { models: [{ id: 'claude-opus-5' }, { id: 'auto', aliases: ['auto-smart'] }] });
      }
      if (path === '/__stub/violations') return send(res, 200, { violations });
      if (path === '/user/repos') {
        return send(res, 200, [{ full_name: 'acme/demo-app', private: false, default_branch: 'main', html_url: 'https://github.com/acme/demo-app' }]);
      }
      const tree = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([^/]+)$/);
      if (tree) return send(res, 200, { tree: Object.keys(FILES).map((file) => ({ path: file, type: 'blob' })) });
      const contents = path.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
      if (contents && FILES[contents[3]]) {
        return send(res, 200, { encoding: 'base64', content: Buffer.from(FILES[contents[3]]).toString('base64') });
      }
      if (/\/pulls\/\d+\/merge$/.test(path) || path.endsWith('/merges') || path.includes('/git/refs/')) {
        violations += 1;
        return send(res, 418, { message: 'merge refused' });
      }
      if (req.method === 'POST' && path === '/v1/agents') {
        const prompt = body.prompt?.text || '';
        const kind = scenario(prompt);
        if (kind === 'repo_access') return send(res, 422, { error: 'IntegrationNotConnected' });
        const agentId = body.agentId || `bc-${Date.now()}`;
        const runId = `run-${agentId}`;
        agents.set(agentId, { runId, prompt, kind, usage: Number(marker(prompt, 'usage') || 1200) });
        return send(res, 200, { agentId, runId, url: `http://127.0.0.1/agents/${agentId}` });
      }
      const agentGet = path.match(/^\/v1\/agents\/([^/]+)$/);
      if (agentGet && req.method === 'GET') {
        const agent = agents.get(agentGet[1]);
        if (!agent) return send(res, 404, { error: 'missing' });
        return send(res, 200, { latestRunId: agent.runId });
      }
      const stream = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/stream$/);
      if (stream) {
        const agent = agents.get(stream[1]);
        if (!agent) return send(res, 404, {});
        if (agent.kind === 'stream_410' && !req.headers['last-event-id']) return send(res, 410, { error: 'stream_expired' });
        const text = resultText(agent.prompt);
        const status = agent.kind === 'error' ? 'ERROR' : agent.kind === 'no_changes' ? 'FINISHED' : 'FINISHED';
        const branch = agent.kind === 'no_changes' || agent.kind === 'error' ? undefined : 'aria/ticket';
        const prUrl = agent.kind === 'ok' ? 'https://github.com/acme/demo-app/pull/7' : undefined;
        const sse = [
          'id: 1',
          `data: ${JSON.stringify({ type: 'assistant', text: 'working' })}`,
          '',
          'id: 2',
          `data: ${JSON.stringify({ type: 'status', status, branch, prUrl, resultText: text, headSha: 'abc123' })}`,
          '',
        ].join('\n');
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(sse);
        return;
      }
      const runGet = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)$/);
      if (runGet && req.method === 'GET') {
        const agent = agents.get(runGet[1]);
        if (!agent) return send(res, 404, {});
        return send(res, 200, { status: 'finished', resultText: resultText(agent.prompt), branch: 'aria/ticket', prUrl: 'https://github.com/acme/demo-app/pull/7', headSha: 'abc123' });
      }
      const usage = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/usage$/);
      if (usage) {
        const agent = agents.get(usage[1]);
        return send(res, 200, { total: agent?.usage ?? 100, input: 40, output: 60, cacheRead: 0, cacheWrite: 0 });
      }
      const cancel = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/cancel$/);
      if (cancel && req.method === 'POST') return send(res, 200, { ok: true });
      const repoBranch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/branches\/([^/]+)$/);
      if (repoBranch) return send(res, 200, { name: repoBranch[3], protected: true });
      const repoMeta = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
      if (repoMeta && req.method === 'GET') return send(res, 200, { default_branch: 'main' });
      const pullCreate = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/);
      if (pullCreate && req.method === 'POST') {
        const number = prSeq++;
        const pull = { number, state: 'open', merged_at: null, head: { sha: 'abc123' }, html_url: `https://github.com/${pullCreate[1]}/${pullCreate[2]}/pull/${number}` };
        pulls.set(pullKey(pullCreate[1], pullCreate[2], number), pull);
        return send(res, 201, pull);
      }
      const pullGet = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/);
      if (pullGet && req.method === 'GET') {
        const key = pullKey(pullGet[1], pullGet[2], pullGet[3]);
        const pull = pulls.get(key) || { number: Number(pullGet[3]), state: 'open', merged_at: null, head: { sha: 'abc123' } };
        const etag = `"pr-${pull.state}-${pull.merged_at}"`;
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { etag });
          res.end();
          return;
        }
        return send(res, 200, pull, { etag });
      }
      if (req.method === 'POST' && /\/pulls\/\d+\/reviews$/.test(path)) {
        if (body.event && body.event !== 'COMMENT') {
          violations += 1;
          return send(res, 422, { message: 'only comments' });
        }
        return send(res, 201, { id: 1 });
      }
      if (req.method === 'POST' && /\/issues\/\d+\/comments$/.test(path)) return send(res, 201, { id: 1 });
      if (path.includes('/check-runs')) return send(res, 200, { check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success' }] });
      const control = path.match(/^\/__stub\/github\/(merge|close)\/(\d+)$/);
      if (control && req.method === 'POST') {
        for (const [key, pull] of pulls) {
          if (key.endsWith(`#${control[2]}`)) {
            pull.state = 'closed';
            pull.merged_at = control[1] === 'merge' ? new Date().toISOString() : null;
          }
        }
        return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'not found', path });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      resolve({
        port: bound,
        base: `http://127.0.0.1:${bound}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const port = Number(process.env.STUB_PORT || 4010);
  startStub({ port }).then((stub) => {
    process.stdout.write(`provider stub on ${stub.base}\n`);
  });
}
