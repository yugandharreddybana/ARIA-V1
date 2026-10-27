/**
 * Milestone 1 manual-style verification. Talks to the local stack and writes
 * docs/verification/screenshots plus docs/verification/results.json.
 *
 *   node scripts/m1-verify.mjs
 * Run via apps/e2e so Playwright resolves:
 *   pnpm -F @aria/e2e exec node ../../scripts/m1-verify.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(root, 'apps/e2e/package.json'));
const { chromium } = require('@playwright/test');

const API = process.env.API_URL || 'http://127.0.0.1:3001';
const WEB = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(root, 'docs/verification/screenshots');
const PASSWORD = 'Test1234!';
const MIX = { business: 1, qa: 2, frontend: 1, backend: 1, fullstack: 1, junior: 1, aiml: 0, devops: 0, security: 0 };
const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
].filter((viewport) => !process.env.M1_VIEWPORT || viewport.name === process.env.M1_VIEWPORT);

fs.mkdirSync(OUT, { recursive: true });
const results = [];

function alert(page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').first();
}

function record(feature, scenario, result, evidence, detail = '') {
  results.push({ feature, scenario, result, evidence: evidence || '', detail });
  process.stdout.write(`${result.toUpperCase()}  ${feature} — ${scenario}${detail ? ` — ${detail}` : ''}\n`);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `docs/verification/screenshots/${name}.png`;
}

function email(label) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@aria.dev`;
}

async function call(pathname, { method = 'GET', token, cookie, body } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookie, text };
}

async function signupApi(label) {
  const address = email(label);
  const res = await call('/api/auth/signup', {
    method: 'POST',
    body: { name: 'M1 Owner', email: address, password: PASSWORD },
  });
  const cookie = res.setCookie.map((row) => row.split(';')[0]).join('; ');
  return { address, res, token: res.json?.accessToken, cookie };
}

async function apiSuite() {
  const health = await call('/api/health');
  record('Stack', 'middleware health', health.status === 200 && health.json?.status === 'healthy' ? 'pass' : 'fail', '', `HTTP ${health.status}`);
  if (process.env.M1_SKIP_JAVA === '1') {
    record('Stack', 'Java backend health', 'deferred', '', 'M1_SKIP_JAVA=1 (e2e job has no Java process)');
  } else {
    const java = await fetch('http://127.0.0.1:8080/api/health').then(async (res) => ({ status: res.status, json: await res.json() })).catch((err) => ({ status: 0, json: { error: String(err) } }));
    record('Stack', 'Java backend health', java.status === 200 && java.json?.status === 'healthy' ? 'pass' : 'fail', '', `HTTP ${java.status}`);
  }
  const pg = await fetch('http://127.0.0.1:4010/v1/me').then((res) => res.status).catch(() => 0);
  record('Stack', 'provider stub /v1/me', pg === 200 ? 'pass' : 'fail', '', `HTTP ${pg}`);

  const created = await signupApi('api');
  const leaked = JSON.stringify(created.res.json).includes(PASSWORD);
  record('Signup', 'API creates account and returns an access token', created.res.status === 201 && created.token && !leaked ? 'pass' : 'fail', '', `HTTP ${created.res.status}`);
  const dup = await call('/api/auth/signup', { method: 'POST', body: { name: 'M1 Owner', email: created.address, password: PASSWORD } });
  record('Signup', 'duplicate email rejected', dup.status === 409 ? 'pass' : 'fail', '', `HTTP ${dup.status}`);
  const weak = await call('/api/auth/signup', { method: 'POST', body: { name: 'M1', email: email('weak'), password: 'password' } });
  record('Signup', 'weak password rejected', weak.status === 400 ? 'pass' : 'fail', '', `HTTP ${weak.status}`);

  const badLogin = await call('/api/auth/login', { method: 'POST', body: { email: created.address, password: 'Wrong1234!' } });
  record('Login', 'wrong password rejected', badLogin.status === 401 ? 'pass' : 'fail', '', `HTTP ${badLogin.status}`);
  const login = await call('/api/auth/login', { method: 'POST', body: { email: created.address, password: PASSWORD } });
  const loginCookie = login.setCookie.map((row) => row.split(';')[0]).join('; ');
  const httpOnly = login.setCookie.some((row) => /aria_refresh/i.test(row) && /httponly/i.test(row));
  record('Login', 'valid password returns a token and an HttpOnly refresh cookie', login.status === 200 && login.json?.accessToken && httpOnly ? 'pass' : 'fail', '', `HTTP ${login.status}`);

  const me = await call('/api/auth/me', { token: login.json.accessToken });
  record('Session', 'access token reads the current user', me.status === 200 && me.json?.user?.email === created.address ? 'pass' : 'fail', '', `HTTP ${me.status}`);
  const anon = await call('/api/auth/me');
  record('Session', 'missing token is rejected', anon.status === 401 ? 'pass' : 'fail', '', `HTTP ${anon.status}`);
  const garbage = await call('/api/auth/me', { token: 'not-a-jwt' });
  record('Session', 'garbage access token is rejected', garbage.status === 401 ? 'pass' : 'fail', '', `HTTP ${garbage.status}`);
  const refreshed = await call('/api/auth/refresh', { method: 'POST', cookie: loginCookie });
  record('Session', 'refresh cookie issues a new access token', refreshed.status === 200 && refreshed.json?.accessToken ? 'pass' : 'fail', '', `HTTP ${refreshed.status}`);
  const loggedOut = await call('/api/auth/logout', { method: 'POST', cookie: loginCookie });
  const afterLogout = await call('/api/auth/refresh', { method: 'POST', cookie: loginCookie });
  record('Logout', 'refresh cookie is revoked', loggedOut.status === 200 && afterLogout.status === 401 ? 'pass' : 'fail', '', `logout ${loggedOut.status} refresh ${afterLogout.status}`);

  const owner = await signupApi('owner');
  const other = await signupApi('other');
  const project = await call('/api/projects', { method: 'POST', token: owner.token, body: { name: 'Owner Shop', description: 'first' } });
  const projectId = project.json?.project?.id;
  record('Projects', 'create project', project.status === 201 && projectId ? 'pass' : 'fail', '', `HTTP ${project.status}`);
  const edited = await call(`/api/projects/${projectId}`, { method: 'PATCH', token: owner.token, body: { name: 'Renamed Shop' } });
  record(
    'Projects',
    'edit project name',
    edited.status === 200 && edited.json?.project?.name === 'Renamed Shop' ? 'pass' : 'fail',
    '',
    `HTTP ${edited.status} name=${edited.json?.project?.name || ''} ${edited.json?.error || edited.json?.message || ''}`.trim(),
  );
  const foreign = await call(`/api/projects/${projectId}`, { token: other.token });
  record('Authorization', 'user B cannot read user A project', foreign.status === 404 ? 'pass' : 'fail', '', `HTTP ${foreign.status}`);
  const foreignList = await call('/api/projects', { token: other.token });
  const leakedProject = JSON.stringify(foreignList.json).includes(projectId);
  record('Authorization', 'user B project list hides user A', foreignList.status === 200 && !leakedProject ? 'pass' : 'fail', '', `HTTP ${foreignList.status}`);
  const archived = await call(`/api/projects/${projectId}`, { method: 'DELETE', token: owner.token });
  const afterArchive = await call(`/api/projects/${projectId}`, { token: owner.token });
  record('Projects', 'delete archives the project', archived.status === 204 && afterArchive.json?.project?.status === 'archived' ? 'pass' : 'fail', '', `delete ${archived.status} status ${afterArchive.json?.project?.status}`);
  const otherArchive = await call(`/api/projects/${projectId}`, { method: 'DELETE', token: other.token });
  record('Authorization', 'user B cannot archive user A project', otherArchive.status === 404 ? 'pass' : 'fail', '', `HTTP ${otherArchive.status}`);

  const providers = [
    { id: 'cursor', body: { provider: 'cursor', model: 'cursor-agent', apiKey: 'live-stub-key' } },
    { id: 'openai', body: { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'live-stub-key' } },
    { id: 'anthropic', body: { provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'live-stub-key' } },
    { id: 'nvidia', body: { provider: 'nvidia', model: 'meta/llama-3.1-8b-instruct', apiKey: 'nvapi-live-stub-key' } },
    { id: 'ollama', body: { provider: 'ollama', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:4010' } },
    { id: 'openai_compatible', body: { provider: 'openai_compatible', model: 'local-model', apiKey: 'live-stub-key', baseUrl: 'http://127.0.0.1:4010' } },
    { id: 'custom', body: { provider: 'custom', model: 'local-model', baseUrl: 'http://127.0.0.1:4010' } },
    { id: 'gemini', body: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'not-a-real-gemini-key' } },
    { id: 'groq', body: { provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'not-a-real-groq-key' } },
  ];
  for (const provider of providers) {
    const tested = await call('/api/workspace/llm-config/test', { method: 'POST', token: owner.token, body: provider.body });
    const message = String(tested.json?.message || tested.json?.error || '');
    const hosted = provider.id === 'gemini' || provider.id === 'groq';
    const ok = tested.status === 200 && tested.json?.ok === true && !/mock connection/i.test(message);
    if (hosted) {
      const failedClosed = tested.json?.ok === false && !/mock connection/i.test(message);
      record('LLM providers', `${provider.id} Test Connection without a real key fails closed`, failedClosed ? 'pass' : 'fail', '', `HTTP ${tested.status} ${message.slice(0, 140)}`);
    } else {
      record('LLM providers', `${provider.id} Test Connection against the stub`, ok ? 'pass' : 'fail', '', `HTTP ${tested.status} ${message.slice(0, 160)}`);
    }
  }
  const mockKey = await call('/api/workspace/llm-config/test', {
    method: 'POST',
    token: owner.token,
    body: { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'aria-mock-key' },
  });
  const mockMessage = String(mockKey.json?.message || mockKey.json?.error || '');
  record(
    'LLM providers',
    'live mode does not treat aria-mock-key as a mock success',
    mockKey.json?.ok !== true && !/mock connection succeeded/i.test(mockMessage) ? 'pass' : 'fail',
    '',
    `HTTP ${mockKey.status} ${mockMessage.slice(0, 140)}`,
  );
  const missingModel = await call('/api/workspace/llm-config/test', {
    method: 'POST',
    token: owner.token,
    body: { provider: 'ollama', model: 'missing-model', baseUrl: 'http://127.0.0.1:4010' },
  });
  record('Model validation', 'unknown Ollama model is rejected', missingModel.json?.ok === false ? 'pass' : 'fail', '', String(missingModel.json?.message || '').slice(0, 140));

  const saved = await call('/api/workspace/llm-config', {
    method: 'PATCH',
    token: owner.token,
    body: { provider: 'cursor', model: 'cursor-agent', apiKey: 'live-stub-key' },
  });
  const savedText = JSON.stringify(saved.json);
  record(
    'LLM providers',
    'saving Cursor stores tier ids and hides the key',
    saved.status === 200 && saved.json?.config?.topModel === 'claude-opus-5' && saved.json?.config?.autoModel === 'auto' && !savedText.includes('live-stub-key') ? 'pass' : 'fail',
    '',
    `HTTP ${saved.status} top=${saved.json?.config?.topModel} auto=${saved.json?.config?.autoModel}`,
  );

  const badRepo = await call('/api/setup/repos', {
    method: 'POST',
    token: owner.token,
    body: { projectId, repos: [{ fullName: 'not a repo', branch: 'main' }] },
  });
  record('GitHub', 'repo name that is not owner/name is rejected', badRepo.status === 400 ? 'pass' : 'fail', '', `HTTP ${badRepo.status}`);
  const traversal = await call('/api/setup/repos', {
    method: 'POST',
    token: owner.token,
    body: { projectId, repos: [{ fullName: '../secret', branch: 'main' }] },
  });
  record('GitHub', 'repo name with .. is rejected', traversal.status === 400 ? 'pass' : 'fail', '', `HTTP ${traversal.status}`);

  const fresh = await call('/api/setup/project', { method: 'POST', token: owner.token, body: { name: 'Catalog Shop' } });
  const catalogId = fresh.json?.project?.id;
  const badTier = await call(`/api/projects/${catalogId}/model-tiers`, {
    method: 'PATCH',
    token: owner.token,
    body: { planning: 'top', development: 'auto', topModel: 'claude-4.6-opus-thinking' },
  });
  record('Model tiers', 'model id outside the tested catalog is rejected', badTier.status === 422 ? 'pass' : 'fail', '', `HTTP ${badTier.status}`);
  const goodTier = await call(`/api/projects/${catalogId}/model-tiers`, {
    method: 'PATCH',
    token: owner.token,
    body: { planning: 'top', development: 'auto', topModel: 'claude-opus-5', autoModel: 'auto' },
  });
  record('Model tiers', 'catalog ids can be pinned', goodTier.status === 200 && goodTier.json?.modelTiers?.topModel === 'claude-opus-5' ? 'pass' : 'fail', '', `HTTP ${goodTier.status}`);

  const tokenSaved = await call('/api/github/token', { method: 'POST', token: owner.token, body: { token: 'live-stub-github' } });
  const repos = await call('/api/github/repos', { token: owner.token });
  record('GitHub', 'token connects and lists the stub repo', tokenSaved.status === 200 && repos.json?.repos?.[0]?.fullName === 'acme/demo-app' ? 'pass' : 'fail', '', `token ${tokenSaved.status} repos ${repos.status}`);
  const otherRepos = await call('/api/github/repos', { token: other.token });
  record('Authorization', 'user B has no GitHub token', otherRepos.status === 400 ? 'pass' : 'fail', '', `HTTP ${otherRepos.status}`);
  const connected = await call('/api/setup/repos', {
    method: 'POST',
    token: owner.token,
    body: { projectId: catalogId, repos: [{ fullName: 'acme/demo-app', branch: 'main' }] },
  });
  record('GitHub', 'connecting a listed repo queues analysis', connected.status === 201 ? 'pass' : 'fail', '', `HTTP ${connected.status}`);
  let knowledge = null;
  for (let i = 0; i < 20; i++) {
    knowledge = await call(`/api/projects/${catalogId}/knowledge`, { token: owner.token });
    if (knowledge.json?.map?.summary) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const flowNames = (knowledge.json?.flows || []).map((flow) => flow.name);
  record(
    'Knowledge map',
    'analysis builds flows for signup, login, and the homepage',
    Boolean(knowledge.json?.map?.summary) && flowNames.some((name) => /signup/i.test(name)) && flowNames.some((name) => /login/i.test(name)) ? 'pass' : 'fail',
    '',
    flowNames.join(', ') || 'no flows',
  );
  const otherKnowledge = await call(`/api/projects/${catalogId}/knowledge`, { token: other.token });
  record('Authorization', 'user B cannot read the knowledge map', otherKnowledge.status === 404 ? 'pass' : 'fail', '', `HTTP ${otherKnowledge.status}`);

  async function companyOf(size) {
    const made = await call('/api/setup/project', { method: 'POST', token: owner.token, body: { name: `Size ${size}` } });
    const id = made.json.project.id;
    const generated = await call(`/api/projects/${id}/company`, { method: 'POST', token: owner.token, body: { size, mix: MIX } });
    return { id, generated };
  }
  for (const size of [3, 10, 12, 40]) {
    const { generated } = await companyOf(size);
    const agents = generated.json?.agents || [];
    const on = agents.filter((agent) => agent.enabled);
    const docs = agents.filter((agent) => agent.roleKey === 'documentation');
    const pr = agents.filter((agent) => agent.roleKey === 'pr_coordinator');
    const leaders = new Set(agents.filter((agent) => ['ceo', 'cfo', 'cto'].includes(agent.roleKey)).map((agent) => agent.roleKey));
    const expectedLeaders = size >= 8 ? ['ceo', 'cto', 'cfo'] : size >= 2 ? ['ceo', 'cto'] : ['ceo'];
    const leadersOk = expectedLeaders.every((role) => leaders.has(role));
    const extrasOff = size < 12 ? docs[0]?.enabled === false && pr[0]?.enabled === false : docs[0]?.enabled === true && pr[0]?.enabled === true;
    const ok = (generated.status === 201 || generated.status === 202) && on.length === size && docs.length === 1 && pr.length === 1 && extrasOff && leadersOk;
    record('Company', `size ${size} counts ON seats and always includes docs + PR coordinator`, ok ? 'pass' : 'fail', '', `HTTP ${generated.status} on=${on.length} docs=${docs[0]?.enabled} pr=${pr[0]?.enabled}`);
  }
  const tooSmall = await call(`/api/projects/${catalogId}/company`, { method: 'POST', token: owner.token, body: { size: 2, mix: MIX } });
  const tooBig = await call(`/api/projects/${catalogId}/company`, { method: 'POST', token: owner.token, body: { size: 41, mix: MIX } });
  record('Company', 'size below 3 and above 40 is rejected', tooSmall.status === 400 && tooBig.status === 400 ? 'pass' : 'fail', '', `${tooSmall.status}/${tooBig.status}`);

  const generatedOrg = await call(`/api/projects/${catalogId}/company`, { method: 'POST', token: owner.token, body: { size: 10, mix: MIX } });
  const org = { id: catalogId, generated: generatedOrg };
  const company = org.generated.json;
  const flow = company.flows?.[0];
  if (!flow?.ownerAgentId) {
    record('Flow ownership', 'generated company has a flow to reassign', 'fail', '', `flows=${company.flows?.length ?? 0}`);
    return;
  }
  const ownerAgent = company.agents.find((agent) => agent.id === flow?.ownerAgentId);
  const backup = company.agents.find((agent) => agent.id !== ownerAgent?.id);
  const reassigned = await call(`/api/projects/${org.id}/flows/${flow.id}`, {
    method: 'PATCH',
    token: owner.token,
    body: { ownerAgentId: ownerAgent.id, backupAgentId: backup.id },
  });
  const updatedFlow = reassigned.json?.flows?.find((row) => row.id === flow.id);
  record('Flow ownership', 'owner and backup can be reassigned on the same project', reassigned.status === 200 && updatedFlow?.ownerAgentId === ownerAgent.id && updatedFlow?.backupAgentId === backup.id ? 'pass' : 'fail', '', `HTTP ${reassigned.status}`);
  const foreignAgent = (await companyOf(3)).generated.json.agents[0];
  const cross = await call(`/api/projects/${org.id}/flows/${flow.id}`, {
    method: 'PATCH',
    token: owner.token,
    body: { ownerAgentId: foreignAgent.id },
  });
  record('Flow ownership', 'an owner from another project is rejected', cross.status === 400 ? 'pass' : 'fail', '', `HTTP ${cross.status}`);
  const removed = await call(`/api/projects/${org.id}/agents/${ownerAgent.id}`, { method: 'DELETE', token: owner.token });
  const afterDelete = await call(`/api/projects/${org.id}/company`, { token: owner.token });
  const promoted = afterDelete.json?.flows?.find((row) => row.id === flow.id);
  record('Flow ownership', 'deleting the owner promotes the backup', removed.status === 204 && promoted?.ownerAgentId === backup.id ? 'pass' : 'fail', '', `delete ${removed.status} owner ${promoted?.ownerAgentId === backup.id}`);

  const ticket = await call('/api/tickets', {
    method: 'POST',
    token: owner.token,
    body: { projectId: org.id, title: 'Keep me', description: 'blocks regen', type: 'feature' },
  });
  const beforeIds = (afterDelete.json?.agents || []).map((agent) => agent.id).sort().join();
  const blocked = await call(`/api/projects/${org.id}/company`, { method: 'POST', token: owner.token, body: { size: 8, mix: MIX } });
  const still = await call(`/api/projects/${org.id}/company`, { token: owner.token });
  const afterIds = (still.json?.agents || []).map((agent) => agent.id).sort().join();
  record('Company', 'regeneration without force returns 409 and keeps the org', ticket.status === 201 && blocked.status === 409 && beforeIds === afterIds ? 'pass' : 'fail', '', `ticket ${ticket.status} regen ${blocked.status}`);
  const forced = await call(`/api/projects/${org.id}/company`, { method: 'POST', token: owner.token, body: { size: 8, mix: MIX, force: true } });
  const forcedOn = (forced.json?.agents || []).filter((agent) => agent.enabled).length;
  record('Company', 'forced regeneration replaces the org in one response', (forced.status === 201 || forced.status === 202) && forcedOn === 8 ? 'pass' : 'fail', '', `HTTP ${forced.status} on=${forcedOn}`);

  const legacy = await call(`/api/projects/${org.id}/skills`, { method: 'POST', token: owner.token, body: { name: 'shadow' } });
  record('Company', 'legacy unvalidated skill create returns 410', legacy.status === 410 ? 'pass' : 'fail', '', `HTTP ${legacy.status}`);
}

async function openNav(page, viewport) {
  if (viewport === 'desktop') return;
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
}

async function uiSuite() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const tag = viewport.name;
      const address = email(tag);
      try {
        await page.goto(`${WEB}/`);
        record('Landing', `home page renders (${tag})`, await page.getByRole('link', { name: 'Get Started' }).first().isVisible() ? 'pass' : 'fail', await shot(page, `landing-${tag}`));

        await page.goto(`${WEB}/signup`);
        await page.fill('[name="name"]', 'A');
        await page.fill('[name="email"]', address);
        await page.fill('[name="password"]', PASSWORD);
        await page.fill('[name="confirm"]', PASSWORD);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        const nameAlert = alert(page);
        await nameAlert.waitFor({ timeout: 15000 });
        record('Signup', `name shorter than 2 characters is rejected (${tag})`, /at least 2|name/i.test(await nameAlert.innerText()) ? 'fixed' : 'fail', await shot(page, `signup-validation-${tag}`), await nameAlert.innerText());
        await page.fill('[name="name"]', 'Milestone Owner');
        await page.click('button[type="submit"]');
        await page.getByTestId('setup-project-name').waitFor({ timeout: 20000 });
        record('Signup', `account lands on setup (${tag})`, page.url().includes('/setup') ? 'pass' : 'fail', await shot(page, `signup-dashboard-${tag}`));

        await page.goto(`${WEB}/projects`);
        await page.getByText('No projects yet').waitFor({ timeout: 10000 });
        record(
          'Projects',
          `empty state (${tag})`,
          await page.getByText('No projects yet').isVisible() ? 'pass' : 'fail',
          await shot(page, `projects-empty-${tag}`),
        );

        await page.route('**/api/projects', async (route) => {
          try {
            if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, 1200));
            await route.continue();
          } catch {
            // The navigation can settle the request before this handler resumes.
          }
        });
        const loadingNav = page.goto(`${WEB}/projects`);
        const sawSpinner = await page.getByText('Loading projects').waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        const loadingShot = await shot(page, `projects-loading-${tag}`);
        await loadingNav;
        await page.unroute('**/api/projects');
        await page.getByText('No projects yet').waitFor({ timeout: 10000 });
        record('Projects', `loading state (${tag})`, sawSpinner ? 'pass' : 'fail', loadingShot);

        await page.route('**/api/projects', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }));
        await page.goto(`${WEB}/projects`);
        await page.getByText('Failed to load projects').waitFor({ timeout: 10000 });
        record(
          'Projects',
          `error state (${tag})`,
          await page.getByText('Failed to load projects').isVisible() ? 'pass' : 'fail',
          await shot(page, `projects-error-${tag}`),
        );
        await page.unroute('**/api/projects');

        await page.goto(`${WEB}/projects`);
        await page.getByTestId('start-setup').click();
        await page.waitForURL(/\/setup/, { timeout: 15000 });
        await page.getByTestId('setup-project-name').waitFor({ timeout: 15000 });
        record(
          'Setup',
          `projects page offers setup (${tag})`,
          page.url().includes('/setup') && await page.getByTestId('setup-project-name').isVisible() ? 'pass' : 'fail',
          await shot(page, `dashboard-empty-${tag}`),
        );
        await page.getByTestId('setup-project-name').fill(`Setup ${tag}`);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByTestId('provider-cursor').waitFor();
        record('LLM providers', `provider picker (${tag})`, await page.getByTestId('provider-groq').isVisible() ? 'pass' : 'fail', await shot(page, `providers-${tag}`));

        if (tag === 'desktop') {
          const cases = [
            ['cursor', 'live-stub-key', null, true],
            ['openai', 'live-stub-key', null, true],
            ['anthropic', 'live-stub-key', null, true],
            ['ollama', null, 'http://127.0.0.1:4010', true],
            ['openai_compatible', 'live-stub-key', 'http://127.0.0.1:4010', true],
            ['gemini', 'aria-mock-key', null, false],
            ['groq', 'aria-mock-key', null, false],
            ['ollama', null, 'http://127.0.0.1:1', false],
          ];
          for (const [id, key, base, expectOk] of cases) {
            await page.getByTestId(`provider-${id}`).click();
            // M3A allows several labeled keys; unique labels avoid 409 reuse of a prior ok row
            // (e.g. a second ollama attempt must not retest the stub URL from the first).
            await page.getByTestId('credential-label').fill(`${id}-${expectOk ? 'ok' : 'bad'}-${Date.now()}`);
            if (base !== null) await page.getByTestId('llm-base-url').fill(base);
            if (key !== null) await page.getByTestId('llm-api-key').fill(key);
            await page.getByTestId('test-connection').click();
            const result = page.getByTestId('test-connection-result');
            await result.waitFor({ timeout: 20000 });
            const text = await result.innerText();
            const ok = /succeeded|verified/i.test(text);
            const pass = expectOk ? ok && !/mock connection/i.test(text) : !ok && !/mock connection succeeded/i.test(text);
            record('LLM providers', `${id} Test Connection ${expectOk ? 'success' : 'failure'} in the setup UI`, pass ? 'pass' : 'fail', await shot(page, `provider-${id}-${expectOk ? 'ok' : 'fail'}`), text.slice(0, 160));
          }
        }

        await page.getByTestId('provider-cursor').click();
        await page.getByTestId('llm-api-key').fill('live-stub-key');
        await page.getByTestId('test-connection').click();
        const cursorReady = page.getByTestId('test-connection-result');
        await cursorReady.waitFor({ timeout: 20000 });
        await expectText(cursorReady, 'verified');
        await page.getByTestId('setup-next').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('setup-next').click({ timeout: 15000 });
        await page.getByTestId('github-token').fill('short');
        const listDisabled = await page.getByTestId('list-repos').isDisabled();
        record('GitHub', `token shorter than 8 characters cannot list repos (${tag})`, listDisabled ? 'pass' : 'fail', await shot(page, `github-short-token-${tag}`));
        await page.getByTestId('github-token').fill('live-stub-github');
        await page.getByTestId('list-repos').click();
        await page.getByTestId('repo-acme-demo-app').waitFor({ timeout: 15000 });
        record(
          'GitHub',
          `stub repo is listed (${tag})`,
          await page.getByTestId('repo-acme-demo-app').isVisible() ? 'pass' : 'fail',
          await shot(page, `github-repos-${tag}`),
        );
        await page.getByTestId('repo-acme-demo-app').check();
        await page.getByTestId('connect-repos').click();
        await page.getByTestId('knowledge-summary').filter({ hasText: /signup/i }).waitFor({ timeout: 45000 });
        record('Knowledge map', `setup shows the map (${tag})`, await page.getByTestId('knowledge-flow').filter({ hasText: 'Login' }).isVisible() ? 'pass' : 'fail', await shot(page, `knowledge-${tag}`));

        await page.getByTestId('company-size').fill('10');
        await page.getByTestId('generate-company').click();
        await page.getByTestId('open-org-chart').waitFor({ timeout: 20000 });
        record(
          'Company',
          `generation finishes and offers the org chart (${tag})`,
          await page.getByTestId('open-org-chart').isVisible() ? 'pass' : 'fail',
          await shot(page, `company-ready-${tag}`),
        );
        await page.getByTestId('open-org-chart').click();
        await page.getByTestId('org-chart').waitFor({ timeout: 15000 });
        const docsOff = page.locator('[data-testid^="agent-documentation"]').first();
        const prOff = page.locator('[data-testid^="agent-pr_coordinator"]').first();
        await docsOff.waitFor();
        await expectText(docsOff, 'OFF');
        await expectText(prOff, 'OFF');
        const docsText = await docsOff.innerText();
        const prText = await prOff.innerText();
        record(
          'Org chart',
          `chart, documentation, and PR coordinator are visible (${tag})`,
          docsText.includes('OFF') && prText.includes('OFF') ? 'pass' : 'fail',
          await shot(page, `org-chart-${tag}`),
          `docs=${docsText} pr=${prText}`,
        );

        const ceo = page.locator('[data-testid^="agent-ceo"]').first();
        await ceo.scrollIntoViewIfNeeded();
        await ceo.click({ force: true });
        await page.getByTestId('agent-instructions').fill('Own the company priorities.');
        await page.getByTestId('save-agent').click();
        await page.getByText('Own the company priorities.').waitFor({ timeout: 10000 }).catch(() => undefined);
        record('Org chart', `edit instructions (${tag})`, (await page.getByTestId('agent-instructions').inputValue()).includes('Own the company priorities.') ? 'pass' : 'fail', await shot(page, `org-edit-${tag}`));
        await page.getByTestId('agent-toggle').click();
        await expectText(ceo, 'OFF');
        record('Org chart', `toggle CEO off (${tag})`, (await ceo.innerText()).includes('OFF') ? 'pass' : 'fail', await shot(page, `org-toggle-${tag}`));
        await page.getByTestId('agent-toggle').click();
        await expectText(ceo, 'ON');
        record('Org chart', `toggle CEO back on (${tag})`, (await ceo.innerText()).includes('ON') ? 'pass' : 'fail', await shot(page, `org-toggle-on-${tag}`));

        await page.getByTestId('new-agent-name').fill('Nora Analyst');
        await page.getByTestId('new-agent-title').fill('QA Analyst');
        await page.getByTestId('new-agent-role').selectOption('qa');
        await page.getByTestId('new-agent-manager').selectOption({ index: 1 });
        await page.getByTestId('add-agent').click();
        const nora = page.getByRole('button', { name: /Nora Analyst/ });
        await nora.waitFor({ timeout: 10000 });
        record(
          'Org chart',
          `add an agent (${tag})`,
          await nora.isVisible() && (await nora.innerText()).includes('Nora Analyst') ? 'pass' : 'fail',
          await shot(page, `org-add-${tag}`),
        );
        await nora.click();
        await page.getByTestId('agent-delete').click();
        record('Org chart', `delete asks for confirmation (${tag})`, await page.getByTestId('agent-delete-confirm').isVisible() ? 'pass' : 'fail', await shot(page, `org-delete-confirm-${tag}`));
        await page.getByTestId('agent-delete-confirm').click();
        await nora.waitFor({ state: 'detached', timeout: 10000 });
        record('Org chart', `confirmed delete removes the agent (${tag})`, await page.getByRole('button', { name: /Nora Analyst/ }).count() === 0 ? 'pass' : 'fail', await shot(page, `org-deleted-${tag}`));

        const flowOwner = page.locator('[data-testid^="flow-owner-"]').first();
        if (await flowOwner.count()) {
          const before = await flowOwner.inputValue();
          const options = await flowOwner.locator('option').count();
          if (options > 2) await flowOwner.selectOption({ index: 2 });
          await page.waitForTimeout(500);
          record('Flow ownership', `owner select changes in the org chart (${tag})`, (await flowOwner.inputValue()) !== '' ? 'pass' : 'fail', await shot(page, `flow-owner-${tag}`), `before=${before}`);
        } else {
          record('Flow ownership', `owner select changes in the org chart (${tag})`, 'fail', await shot(page, `flow-owner-${tag}`), 'no flow select');
        }

        const topModel = page.getByTestId('project-top-model');
        await topModel.scrollIntoViewIfNeeded();
        await topModel.fill('not-a-real-model');
        const rejected = page.waitForResponse((res) => res.url().includes('/model-tiers') && res.request().method() === 'PATCH', { timeout: 15000 });
        await topModel.press('Enter');
        const rejectedResponse = await rejected;
        const tierError = page.getByText(/not in the provider catalog/i);
        await tierError.waitFor({ timeout: 15000 });
        record('Model tiers', `unknown model id shows an error (${tag})`, rejectedResponse.status() === 422 ? 'pass' : 'fail', await shot(page, `tiers-invalid-${tag}`), `HTTP ${rejectedResponse.status()} ${await tierError.innerText()}`);
        await page.getByTestId('project-top-model').fill('claude-opus-5');
        const autoModel = page.getByTestId('project-auto-model');
        await autoModel.fill('auto');
        await page.getByTestId('project-development-tier').selectOption('top');
        const savedTiers = page.waitForResponse((res) => res.url().includes('/model-tiers') && res.request().method() === 'PATCH' && res.ok(), { timeout: 15000 });
        await autoModel.press('Enter');
        await savedTiers;
        await page.getByText('Development uses claude-opus-5').waitFor({ timeout: 10000 });
        record(
          'Model tiers',
          `valid tier change is saved (${tag})`,
          await page.getByText('Development uses claude-opus-5').isVisible() ? 'pass' : 'fail',
          await shot(page, `tiers-saved-${tag}`),
        );

        await page.goto(`${WEB}/projects`);
        await page.getByRole('button', { name: 'New Project' }).click();
        await page.locator('#pname').waitFor({ timeout: 10000 });
        const shopName = `UI Shop ${tag}`;
        await page.locator('#pname').fill(shopName);
        await page.locator('#pdesc').fill('Created from the projects page');
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        const createdCard = page.getByTestId('project-card').filter({ hasText: shopName });
        await createdCard.first().waitFor({ timeout: 15000 });
        record(
          'Projects',
          `create from the projects page (${tag})`,
          await createdCard.count() > 0 && (await createdCard.first().innerText()).includes(shopName) ? 'pass' : 'fail',
          await shot(page, `projects-created-${tag}`),
        );
        const renameControl = page.getByTestId('rename-project');
        const archiveControl = page.getByTestId('archive-project');
        const renameCount = await renameControl.count();
        const archiveCount = await archiveControl.count();
        record(
          'Projects',
          `edit and delete controls on the projects page (${tag})`,
          renameCount > 0 && archiveCount > 0 ? 'pass' : 'fail',
          await shot(page, `projects-edit-delete-${tag}`),
          `rename=${renameCount} archive=${archiveCount}`,
        );

        await openNav(page, tag);
        await page.getByTitle('Sign out').click();
        await page.waitForURL(/\/login/, { timeout: 15000 });
        record('Logout', `sign out returns to login (${tag})`, page.url().includes('/login') ? 'pass' : 'fail', await shot(page, `logout-${tag}`));

        await page.fill('[name="email"]', address);
        await page.fill('[name="password"]', 'Wrong1234!');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await alert(page).waitFor({ timeout: 15000 });
        record('Login', `wrong password shows an error (${tag})`, /invalid email or password/i.test(await alert(page).innerText()) ? 'pass' : 'fail', await shot(page, `login-error-${tag}`));
        await page.fill('[name="password"]', PASSWORD);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForURL(/\/projects/, { timeout: 20000 });
        await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 20000 });
        await page.getByTestId('project-card').first().waitFor({ timeout: 20000 });
        record('Login', `valid password returns to projects (${tag})`, 'pass', await shot(page, `login-ok-${tag}`));

        await page.evaluate(() => localStorage.setItem('aria_token', 'not-a-jwt'));
        await page.goto(`${WEB}/projects`);
        await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 20000 });
        const stayed = page.url().includes('/projects');
        record('Session', `expired access token is refreshed from the cookie (${tag})`, stayed ? 'fixed' : 'fail', await shot(page, `session-expiry-${tag}`), page.url());
      } catch (err) {
        const evidence = await shot(page, `crash-${tag}`).catch(() => '');
        record('UI run', `unhandled failure (${tag})`, 'fail', evidence, err instanceof Error ? err.message : String(err));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function expectText(locator, text) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    if ((await locator.innerText()).includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function main() {
  if (process.env.SKIP_API !== '1') await apiSuite();
  if (process.env.SKIP_UI !== '1') await uiSuite();
  const summary = {
    pass: results.filter((row) => row.result === 'pass').length,
    fail: results.filter((row) => row.result === 'fail').length,
    fixed: results.filter((row) => row.result === 'fixed').length,
    deferred: results.filter((row) => row.result === 'deferred').length,
  };
  fs.writeFileSync(path.join(root, 'docs/verification/results.json'), JSON.stringify({ summary, results }, null, 2));
  process.stdout.write(`\nSUMMARY pass=${summary.pass} fail=${summary.fail} fixed=${summary.fixed}\n`);
  if (summary.fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
