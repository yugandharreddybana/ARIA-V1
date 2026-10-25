#!/usr/bin/env node
/**
 * Local stand-in for the Cursor Cloud Agents API and GitHub.
 * Cursor routes follow the public v1 contract:
 *   POST /v1/agents → 201 { agent, run }
 *   409 error.code agent_id_conflict
 *   GET /v1/agents/{id}
 *   GET /v1/agents/{id}/runs/{runId} with uppercase status and git.branches[]
 *   GET .../stream as SSE event: lines (410 error.code stream_expired)
 *   GET /v1/agents/{id}/usage?runId= → totalUsage.totalTokens
 *   POST .../runs/{runId}/cancel
 * GitHub routes stay for the merge tripwire, pulls, checks, and evidence files.
 * Bind is 127.0.0.1. Tests call startStub({ port }).
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
const evidence = new Map();
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
  const ui = prompt.includes('[[stub:ui]]') || prompt.includes('ui_affected: yes');
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
    ui ? `ui_affected: yes\n![before](${PNG})\n![after](${PNG})` : 'ui_affected: no\nNo UI was touched.',
    '## Logs',
    'before: 1 failed. after: 0 failed.',
    '## Summary',
    'The change closes the ticket. It was required so the gate can see a local before/after result.',
  ].join('\n');
}

function qaReport(prompt) {
  if (!prompt.includes('## Previous behaviour') || marker(prompt, 'no_report')) return '';
  const ui = prompt.includes('[[stub:ui]]') || prompt.toLowerCase().includes('ui_affected: yes');
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
    ui ? `ui_affected: yes\n![before](${PNG})\n![after](${PNG})` : 'ui_affected: no\nNo UI was touched.',
    '## Verdict',
    'pass',
  ].join('\n');
}

function repoSlug(url) {
  const match = String(url || '').match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
  const type = typeof body === 'string' && !headers['content-type'] ? 'text/plain' : (headers['content-type'] || 'application/json');
  res.writeHead(status, { 'content-type': type, 'content-length': payload.length, ...headers });
  res.end(payload);
}

function errorBody(code, message) {
  return { error: { code, message } };
}

function pullKey(owner, repo, number) {
  return `${owner}/${repo}#${number}`;
}

function rememberEvidence(prompt) {
  const key = String(prompt).match(/ARIA-\d+/);
  if (!key) return;
  const dev = devReport(prompt);
  const qa = qaReport(prompt);
  if (dev) evidence.set(`evidence/${key[0]}/dev-report.md`, dev);
  if (qa) evidence.set(`evidence/${key[0]}/qa-report.md`, qa);
}

function registerPull(owner, repo, number, extra = {}) {
  const pull = {
    number,
    state: 'open',
    merged_at: null,
    head: { sha: extra.sha || `head${number}` },
    html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
    files: extra.files || ['apps/middleware/src/services/tickets/ticketPipeline.ts'],
    changes: Boolean(extra.changes),
    ...extra,
  };
  pulls.set(pullKey(owner, repo, number), pull);
  return pull;
}

function diffFor(pull) {
  const files = pull?.files || ['apps/middleware/src/services/tickets/ticketPipeline.ts'];
  return files.map((file) => {
    const markerLine = pull?.changes ? '\n+[[stub:review-changes]]' : '';
    return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new${markerLine}\n`;
  }).join('');
}

function runBody(agent) {
  const slug = repoSlug(agent.repoUrl) || { owner: 'local', repo: 'repo' };
  const finished = agent.kind !== 'error';
  const status = agent.kind === 'error' ? 'ERROR' : 'FINISHED';
  const branch = agent.kind === 'no_changes' || agent.kind === 'error' ? undefined : 'aria/ticket';
  let prUrl;
  const existing = agent.prUrl ? String(agent.prUrl).match(/\/pull\/(\d+)/) : null;
  if (existing) {
    agent.pullNumber = Number(existing[1]);
    prUrl = agent.prUrl;
  } else if (agent.kind === 'ok' || agent.kind === 'slow' || agent.kind === 'stream_410') {
    if (!agent.pullNumber) {
      agent.pullNumber = prSeq++;
      const ui = String(agent.prompt).includes('[[stub:ui]]');
      const files = ui
        ? ['apps/web/src/app/page.tsx', 'apps/middleware/src/services/tickets/ticketPipeline.ts']
        : ['apps/middleware/src/services/tickets/ticketPipeline.ts'];
      const sha = marker(agent.prompt, 'checks') === 'pending' ? `pending${agent.pullNumber}` : `head${agent.pullNumber}`;
      registerPull(slug.owner, slug.repo, agent.pullNumber, {
        sha,
        files,
        changes: String(agent.prompt).includes('[[stub:review-changes]]') || String(agent.prompt).includes('[[stub:review-always]]'),
        sticky: String(agent.prompt).includes('[[stub:review-always]]'),
      });
    }
    prUrl = `https://github.com/${slug.owner}/${slug.repo}/pull/${agent.pullNumber}`;
  }
  const branches = branch ? [{ repoUrl: `github.com/${slug.owner}/${slug.repo}`, branch, ...(prUrl ? { prUrl } : {}) }] : [];
  return {
    id: agent.runId,
    status,
    result: finished ? `${devReport(agent.prompt)}\n${qaReport(agent.prompt)}`.trim() : 'cloud agent failed',
    durationMs: 20,
    git: { branches },
  };
}

function writeSse(res, agent) {
  const body = runBody(agent);
  const sse = [
    'id: 1',
    'event: assistant',
    'data: {"text":"working"}',
    '',
    'id: 2',
    'event: result',
    `data: ${JSON.stringify({ runId: agent.runId, status: body.status, text: body.result, durationMs: body.durationMs, git: body.git })}`,
    '',
    'id: 3',
    'event: done',
    `data: ${JSON.stringify({ runId: agent.runId })}`,
    '',
  ].join('\n');
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  if (agent.kind === 'slow') {
    setTimeout(() => res.end(sse), 400);
    return;
  }
  res.end(sse);
}

export function startStub({ port = 0 } = {}) {
  violations = 0;
  agents.clear();
  pulls.clear();
  evidence.clear();
  prSeq = 1;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = {};
      if (raw) {
        try { body = JSON.parse(raw); } catch { body = {}; }
      }
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
      if (contents) {
        const text = evidence.get(contents[3]) || FILES[contents[3]];
        if (!text) return send(res, 404, { message: 'Not Found' });
        return send(res, 200, { encoding: 'base64', content: Buffer.from(text).toString('base64'), path: contents[3] });
      }
      if (/\/pulls\/\d+\/merge$/.test(path) || path.endsWith('/merges') || path.includes('/git/refs/')) {
        violations += 1;
        return send(res, 418, { message: 'merge refused' });
      }
      if (req.method === 'POST' && path === '/v1/agents') {
        const prompt = body.prompt?.text || '';
        const kind = scenario(prompt);
        if (kind === 'repo_access') return send(res, 400, errorBody('repository_access', 'The key cannot access that repository'));
        const agentId = body.agentId || `bc-${Date.now()}`;
        if (agents.has(agentId)) return send(res, 409, errorBody('agent_id_conflict', 'An agent with this id already exists'));
        const repo = Array.isArray(body.repos) ? body.repos[0] : null;
        const runId = `run_${agentId}`;
        const agent = {
          runId,
          prompt,
          kind,
          repoUrl: repo?.url || '',
          prUrl: repo?.prUrl || null,
          usage: Number(marker(prompt, 'usage') || 1200),
          pullNumber: null,
          streamOpened: false,
        };
        agents.set(agentId, agent);
        rememberEvidence(prompt);
        if (String(prompt).includes('Fix the findings')) {
          const pr = String(body.repos?.[0]?.prUrl || '').match(/\/pull\/(\d+)/);
          if (pr) {
            for (const pull of pulls.values()) {
              if (String(pull.number) === pr[1] && !pull.sticky && !String(prompt).includes('[[stub:review-always]]')) pull.changes = false;
            }
          }
        }
        return send(res, 201, {
          agent: { id: agentId, url: `https://cursor.com/agents/${agentId}` },
          run: { id: runId, status: 'CREATING' },
        });
      }
      const usage = path.match(/^\/v1\/agents\/([^/]+)\/usage$/);
      if (usage && req.method === 'GET') {
        const agent = agents.get(usage[1]);
        if (!agent) return send(res, 404, errorBody('run_not_found', 'Run not found'));
        const runId = url.searchParams.get('runId');
        if (runId && runId !== agent.runId) return send(res, 404, errorBody('run_not_found', 'Run not found'));
        const total = agent.usage;
        const usageBody = { inputTokens: 40, outputTokens: Math.max(0, total - 40), cacheWriteTokens: 0, cacheReadTokens: 0, totalTokens: total };
        return send(res, 200, { totalUsage: usageBody, runs: [{ id: agent.runId, usage: usageBody }] });
      }
      const agentGet = path.match(/^\/v1\/agents\/([^/]+)$/);
      if (agentGet && req.method === 'GET') {
        const agent = agents.get(agentGet[1]);
        if (!agent) return send(res, 404, errorBody('agent_not_found', 'Agent not found'));
        return send(res, 200, { id: agentGet[1], latestRunId: agent.runId, url: `https://cursor.com/agents/${agentGet[1]}` });
      }
      const stream = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/stream$/);
      if (stream && req.method === 'GET') {
        const agent = agents.get(stream[1]);
        if (!agent || agent.runId !== stream[2]) return send(res, 404, errorBody('run_not_found', 'Run not found'));
        if (agent.kind === 'stream_410' && !agent.streamOpened && !req.headers['last-event-id']) {
          agent.streamOpened = true;
          return send(res, 410, errorBody('stream_expired', 'The stream cursor expired'));
        }
        agent.streamOpened = true;
        writeSse(res, agent);
        return;
      }
      const cancel = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)\/cancel$/);
      if (cancel && req.method === 'POST') {
        const agent = agents.get(cancel[1]);
        if (!agent) return send(res, 404, errorBody('run_not_found', 'Run not found'));
        if (agent.kind === 'error') return send(res, 409, errorBody('run_not_cancellable', 'Run is already terminal'));
        agent.kind = 'error';
        agent.cancelled = true;
        return send(res, 200, { id: agent.runId });
      }
      const runGet = path.match(/^\/v1\/agents\/([^/]+)\/runs\/([^/]+)$/);
      if (runGet && req.method === 'GET') {
        const agent = agents.get(runGet[1]);
        if (!agent || agent.runId !== runGet[2]) return send(res, 404, errorBody('run_not_found', 'Run not found'));
        const bodyJson = runBody(agent);
        if (agent.cancelled) bodyJson.status = 'CANCELLED';
        return send(res, 200, bodyJson);
      }
      const repoBranch = path.match(/^\/repos\/([^/]+)\/([^/]+)\/branches\/([^/]+)$/);
      if (repoBranch) {
        return send(res, 200, { name: repoBranch[3], protected: repoBranch[2] !== 'unprotected' });
      }
      const repoMeta = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
      if (repoMeta && req.method === 'GET') return send(res, 200, { default_branch: 'main' });
      const pullFiles = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/files$/);
      if (pullFiles && req.method === 'GET') {
        const pull = pulls.get(pullKey(pullFiles[1], pullFiles[2], pullFiles[3]));
        const files = pull?.files || ['apps/middleware/src/services/tickets/ticketPipeline.ts'];
        return send(res, 200, files.map((filename) => ({ filename, status: 'modified' })));
      }
      const pullCreate = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/);
      if (pullCreate && req.method === 'POST') {
        const number = prSeq++;
        const pull = registerPull(pullCreate[1], pullCreate[2], number, { sha: `head${number}` });
        return send(res, 201, pull);
      }
      const pullGet = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/);
      if (pullGet && req.method === 'GET') {
        const key = pullKey(pullGet[1], pullGet[2], pullGet[3]);
        const pull = pulls.get(key) || registerPull(pullGet[1], pullGet[2], Number(pullGet[3]), { sha: 'abc123' });
        const accept = String(req.headers.accept || '');
        if (accept.includes('diff')) return send(res, 200, diffFor(pull), { 'content-type': 'text/plain' });
        const etag = `"pr-${pull.state}-${pull.merged_at}-${pull.changes}` + '"';
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
      if (path.includes('/check-runs')) {
        const pending = /\/commits\/pending/.test(path);
        if (pending) return send(res, 200, { check_runs: [{ name: 'ci', status: 'pending', conclusion: null }] });
        return send(res, 200, { check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success' }] });
      }
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
