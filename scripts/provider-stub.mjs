#!/usr/bin/env node
/**
 * Local stand-in for Cursor GET /v1/me + /v1/models and the GitHub endpoints
 * the analysis worker calls. Bind is 127.0.0.1. Any bearer token is accepted.
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

const port = Number(process.env.STUB_PORT || 4010);
const host = '127.0.0.1';

function send(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': payload.length });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}`);
  const path = decodeURIComponent(url.pathname);
  if (path === '/v1/me') return send(res, 200, { apiKeyName: 'stub' });
  if (path === '/v1/models') {
    return send(res, 200, { models: [{ id: 'claude-opus-5' }, { id: 'auto', aliases: ['auto-smart'] }] });
  }
  if (path === '/user/repos') {
    return send(res, 200, [{ full_name: 'acme/demo-app', private: false, default_branch: 'main', html_url: 'https://github.com/acme/demo-app' }]);
  }
  const tree = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([^/]+)$/);
  if (tree) {
    return send(res, 200, { tree: Object.keys(FILES).map((file) => ({ path: file, type: 'blob' })) });
  }
  const contents = path.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
  if (contents) {
    const file = FILES[contents[3]];
    if (!file) return send(res, 404, { message: 'Not Found' });
    return send(res, 200, { encoding: 'base64', content: Buffer.from(file).toString('base64') });
  }
  send(res, 404, { message: 'not found' });
});

server.listen(port, host, () => {
  process.stdout.write(`provider stub listening on http://${host}:${port}\n`);
});
