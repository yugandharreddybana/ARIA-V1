import { describe, expect, it, vi } from 'vitest';

const sdkCreate = vi.hoisted(() => vi.fn());
vi.mock('@cursor/sdk', () => ({ Agent: { create: sdkCreate } }));
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { dueAt, scheduleState, workingMsBetween, type WorkCalendar } from '../services/tickets/schedule';
import { transition } from '../services/tickets/ticketPipeline';
import { validateReport } from '../services/evidence/reportValidation';
import { renderReportPdf } from '../services/evidence/pdfReport';
import { developPrompt, qaPrompt } from '../services/activities/prompts';
import { DEV_SECTIONS, QA_SECTIONS } from '../services/evidence/reportValidation';
import { eventHash, canonicalDetail } from '../services/tickets/eventHash';
import { diffHunkLines, sensitivePaths, secretFindings } from '../services/github/diffGuards';
import { extractJson, parseWithRetry } from '../services/models/structuredOutput';
import { backoffMs, p90 } from '../services/runs/budget';
import { redact } from '../services/runs/runLogs';
import { getPullFiles, githubRequest, MergeForbiddenError } from '../services/githubClient.service';
import { asRunError } from '../services/runs/errors';
import { plannerCwd, releasePlannerWorktree, runLocalAgent, scrubbedEnv } from '../services/models/localAgentProcess';
import { fallbackTokenEstimate } from '../services/models/codeWorker';
import { parseEnv } from '../config/env';
import { planWithCursorSdk } from '../services/models/cursorSdkPlanner';
import { catalogIsStale } from '../services/models/resolveForRun';
import { acceptCompanyPlan } from '../services/activities/companyRoster';
import { mergeKnowledgeState } from '../services/activities/knowledgeMerge';

const cal: WorkCalendar = { workdays: [1, 2, 3, 4, 5], timeZone: 'UTC', startMinutes: 9 * 60, endMinutes: 18 * 60 };

describe('story points schedule', () => {
  it('spends working minutes and skips the weekend', () => {
    const monday = new Date('2026-10-05T10:00:00Z');
    expect(dueAt(monday, 1, cal).toISOString()).toBe('2026-10-06T10:00:00.000Z');
    expect(dueAt(monday, 2, cal).toISOString()).toBe('2026-10-07T10:00:00.000Z');
    const friday = new Date('2026-10-09T10:00:00Z');
    expect(dueAt(friday, 2, cal).toISOString()).toBe('2026-10-13T10:00:00.000Z');
    const saturday = new Date('2026-10-10T12:00:00Z');
    expect(dueAt(saturday, 1, cal).toISOString()).toBe('2026-10-13T09:00:00.000Z');
    const afterHours = new Date('2026-10-05T19:00:00Z');
    expect(dueAt(afterHours, 1, cal).toISOString()).toBe('2026-10-07T09:00:00.000Z');
    const lateAfternoon = new Date('2026-10-05T17:30:00Z');
    expect(dueAt(lateAfternoon, 1, cal).toISOString()).toBe('2026-10-06T17:30:00.000Z');
  });

  it('flags at-risk at 80 percent and overdue after due_at', () => {
    const started = new Date('2026-10-05T09:00:00Z');
    const due = dueAt(started, 1, cal);
    const before = scheduleState({ startedAt: started, dueAt: due, points: 1, now: new Date('2026-10-05T15:00:00Z'), terminal: false, riskRatio: 0.8, cal });
    const risk = scheduleState({ startedAt: started, dueAt: due, points: 1, now: new Date('2026-10-05T16:12:00Z'), terminal: false, riskRatio: 0.8, cal });
    const late = scheduleState({ startedAt: started, dueAt: due, points: 1, now: new Date('2026-10-06T09:01:00Z'), terminal: false, riskRatio: 0.8, cal });
    expect(before).toBe('on_track');
    expect(risk).toBe('at_risk');
    expect(late).toBe('overdue');
    expect(workingMsBetween(new Date('2026-10-10T12:00:00Z'), new Date('2026-10-11T12:00:00Z'), cal)).toBe(0);
  });
});

describe('pipeline and evidence', () => {
  const ctx = { reviewRounds: 0, qaRounds: 0, maxReviewRounds: 2, maxQaRounds: 2 };
  it('walks the happy path and blocks the third fix round', () => {
    expect(transition('backlog', 'approve', ctx).status).toBe('ready_for_dev');
    expect(transition('ready_for_dev', 'dispatch', ctx).effects[0]).toEqual({ type: 'enqueue', activity: 'develop' });
    expect(transition('in_qa', 'qa_passed', ctx).status).toBe('awaiting_merge');
    expect(transition('ready_for_review', 'review_changes', { ...ctx, reviewRounds: 2 }).status).toBe('blocked');
    expect(transition('in_progress', 'approve', ctx).status).toBe('in_progress');
  });

  it('requires before and after sections', () => {
    const dev = developPrompt({ ticketKey: 'ARIA-1', title: 'T', description: 'D', storyPoints: 3, persona: 'dev' });
    for (const heading of DEV_SECTIONS) expect(dev).toContain(`## ${heading}`);
    const qa = qaPrompt({ ticketKey: 'ARIA-1', title: 'T', storyPoints: 3, persona: 'qa', diffSummary: 'diff' });
    for (const heading of QA_SECTIONS) expect(qa).toContain(`## ${heading}`);
    const good = `${dev.split('You are an ARIA agent.')[0]}## Commands\nx\n## Before\nold\n## After\nnew\n## Screenshots\nui_affected: no\nn/a\n## Logs\nlog\n## Summary\nwhy`;
    expect(validateReport('dev', good).valid).toBe(true);
    expect(validateReport('dev', good.replace('old', '')).valid).toBe(false);
    const filled = [
      '## Previous behaviour', 'was',
      '## Current behaviour', 'is',
      '## Diff', 'file.ts',
      '## Scenarios', 'pass',
      '## Regression', 'pass',
      '## Screenshots', 'ui_affected: yes',
      '## Verdict', 'pass',
    ].join('\n');
    expect(validateReport('qa', filled).errors).toContain('ui changes require before/after screenshot markdown');
    const saidNo = filled.replace('ui_affected: yes', 'ui_affected: no');
    expect(validateReport('qa', saidNo, { uiFromDiff: true }).errors).toContain('ui changes require before/after screenshot markdown');
  });
});

describe('pdf, hash, guards', () => {
  it('renders a pdf that embeds a png', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const pdf = await renderReportPdf('hello', {
      ticketKey: 'ARIA-9', kind: 'dev', storyPoints: 5, agents: ['dev'], runId: 'run', commitSha: 'abc', generatedAt: '2026-10-25T00:00:00Z',
    }, [{ alt: 'before', bytes: png }]);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('chains hashes and redacts secrets', () => {
    const detail = canonicalDetail({ b: 1, a: 2 });
    const first = eventHash({
      ticketId: 't', seq: 1, eventType: 'status_change', actorKind: 'system', agentId: null, runId: null,
      summary: 'go', detailCanonical: detail, modelId: null, tokensTotal: null, prUrl: null, commitSha: null, prevHash: null,
    });
    const second = eventHash({
      ticketId: 't', seq: 2, eventType: 'status_change', actorKind: 'system', agentId: null, runId: null,
      summary: 'go', detailCanonical: detail, modelId: null, tokensTotal: null, prUrl: null, commitSha: null, prevHash: first,
    });
    expect(first).toHaveLength(64);
    expect(second).not.toBe(first);
    expect(redact('token ghp_abcdefghijklmnopqrstuvwxyz')).toContain('[redacted]');
    expect(sensitivePaths(['.github/workflows/ci.yml', 'src/app.ts'])).toEqual(['.github/workflows/ci.yml']);
    expect(secretFindings('AKIAIOSFODNN7EXAMPLE')).toHaveLength(1);
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeGreaterThan(7);
    expect(backoffMs(1, 0.5)).toBe(30_000);
  });

  it('parses fenced json and retries once', async () => {
    expect(extractJson('noise ```json\n{"ok":true}\n```')).toEqual({ ok: true });
    const schema = z.object({ ok: z.boolean() });
    let calls = 0;
    const parsed = await parseWithRetry(schema, 'nope', async () => {
      calls += 1;
      return '{"ok":true}';
    });
    expect(parsed.retried).toBe(true);
    expect(calls).toBe(1);
    await expect(parseWithRetry(schema, 'nope', async () => 'still nope')).rejects.toThrow();
  });

  it('refuses merge paths before any network call', async () => {
    await expect(githubRequest('token', 'POST', '/repos/a/b/pulls/1/merge')).rejects.toBeInstanceOf(MergeForbiddenError);
    await expect(githubRequest('token', 'POST', '/repos/a/b/merges')).rejects.toBeInstanceOf(MergeForbiddenError);
  });

  it('does not spell a merge call in middleware source', () => {
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (name === '__tests__' || name === 'dist') continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts')) files.push(full);
      }
    };
    walk(root);
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/pulls\/\$\{[^}\n]*\}\/merge/);
    expect(source).not.toMatch(/['"`]\/merges['"`]/);
    expect(source).not.toMatch(/['"`]\/pulls\/['"`]\s*\+/);
    expect(source).not.toMatch(/\/pulls\/['"`]\s*\+/);
  });

  it('scrubs the local agent env to four keys', async () => {
    const env = scrubbedEnv('secret-key');
    expect(Object.keys(env).sort()).toEqual(['CURSOR_API_KEY', 'HOME', 'LANG', 'PATH']);
    expect(env.CURSOR_API_KEY).toBe('secret-key');
    const child = await runLocalAgent({ prompt: '[[stub:env]]', stub: true, timeoutMs: 10_000, apiKey: 'secret-key' });
    expect(JSON.parse(child.text).envKeys).toEqual(['CURSOR_API_KEY', 'HOME', 'LANG', 'PATH']);
  });

  it('calls the live Cursor SDK with plan mode, a sandbox, and close', async () => {
    const send = vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({ status: 'finished', result: '{"ok":true}', usage: { totalTokens: 12 } }) });
    const close = vi.fn();
    sdkCreate.mockResolvedValue({ send, close });
    const planned = await planWithCursorSdk({
      prompt: 'plan the change',
      apiKey: 'live-key',
      modelId: 'claude-opus-5',
      tools: 'read_only',
      cwd: '/tmp/aria-planner',
    });
    expect(planned.text).toBe('{"ok":true}');
    expect(planned.usage?.totalTokens).toBe(12);
    expect(sdkCreate).toHaveBeenCalledWith({
      apiKey: 'live-key',
      model: { id: 'claude-opus-5' },
      mode: 'plan',
      tools: ['read', 'grep', 'glob', 'ls'],
      local: {
        cwd: '/tmp/aria-planner',
        settingSources: [],
        dirs: ['/tmp/aria-planner'],
        sandboxOptions: { enabled: true },
      },
    });
    expect(send).toHaveBeenCalledWith('plan the change', { mode: 'plan' });
    expect(close).toHaveBeenCalledTimes(1);
    sdkCreate.mockResolvedValue({
      send: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({ status: 'error', error: { message: 'planner down' } }) }),
      close: vi.fn(),
    });
    await expect(planWithCursorSdk({ prompt: 'roster', apiKey: 'live-key', modelId: 'auto', tools: 'none', cwd: '/tmp/aria-planner' })).rejects.toThrow('planner down');
    expect(sdkCreate).toHaveBeenLastCalledWith(expect.objectContaining({ tools: [] }));
  });

  it('keeps review comments on diff hunk lines', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      ' context',
      '-old',
      '+new',
    ].join('\n');
    const lines = diffHunkLines(diff);
    expect(lines.get('src/a.ts')?.has(1)).toBe(true);
    expect(lines.get('src/a.ts')?.has(2)).toBe(true);
    expect(lines.get('src/a.ts')?.has(9)).toBe(false);
  });

  it('exits planner children instead of leaving them running', async () => {
    const listed = () => readdirSync('/proc').filter((name) => /^\d+$/.test(name)).filter((pid) => {
      try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('localAgentChild'); } catch { return false; }
    });
    const before = listed();
    await runLocalAgent({ prompt: 'Estimate story points', stub: true, timeoutMs: 10_000, apiKey: 'secret-key' });
    await runLocalAgent({ prompt: 'Estimate story points', stub: true, timeoutMs: 10_000, apiKey: 'secret-key' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(listed().filter((pid) => !before.includes(pid))).toEqual([]);
  });

  it('checks out a repo in its own worktree without keeping the token', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'aria-origin-'));
    const git = (args: string[], cwd = root) => new Promise<void>((resolve, reject) => {
      execFile('git', args, { cwd }, (err) => err ? reject(err) : resolve());
    });
    await git(['init']);
    await git(['config', 'user.email', 'aria@example.com']);
    await git(['config', 'user.name', 'Aria']);
    await mkdir(path.join(root, '.cursor'), { recursive: true });
    await writeFile(path.join(root, '.cursor', 'hooks.json'), '{"hooks":{}}');
    await writeFile(path.join(root, 'README.md'), 'hello\n');
    await git(['add', '.']);
    await git(['commit', '-m', 'init']);
    const token = 'ghp_secret_token_value';
    const [first, second] = await Promise.all([
      plannerCwd({ stub: false, repoUrl: root, githubToken: token }),
      plannerCwd({ stub: false, repoUrl: root, githubToken: token }),
    ]);
    expect(first).not.toBe(second);
    expect(readFileSync(path.join(first, 'README.md'), 'utf8')).toContain('hello');
    expect(existsSync(path.join(first, '.cursor', 'hooks.json'))).toBe(false);
    const gitfile = await readFile(path.join(first, '.git'), 'utf8');
    expect(gitfile).not.toContain(token);
    const again = await plannerCwd({ stub: false, repoUrl: root, githubToken: token, reuseKey: 'json-fix' });
    const reused = await plannerCwd({ stub: false, repoUrl: root, githubToken: token, reuseKey: 'json-fix' });
    expect(reused).toBe(again);
    expect(again).not.toBe(first);
    await releasePlannerWorktree(again);
    expect(existsSync(again)).toBe(true);
    await releasePlannerWorktree(reused);
    await releasePlannerWorktree(first);
    await releasePlannerWorktree(second);
    const worktrees = path.dirname(first);
    expect(existsSync(worktrees) ? readdirSync(worktrees) : []).toEqual([]);
    const skipped = await plannerCwd({ stub: false, repoUrl: `${root}-none`, tools: 'none' });
    expect(path.basename(skipped)).toBe('planner-cwd');
    const noneHash = createHash('sha256').update(`${root}-none`).digest('hex').slice(0, 16);
    const data = process.env.ARIA_DATA_DIR || '/tmp/aria-data';
    expect(existsSync(path.join(data, 'repos', noneHash, 'worktrees'))).toBe(false);
    await expect(runLocalAgent({
      prompt: 'Estimate story points',
      stub: false,
      timeoutMs: 8_000,
      apiKey: 'not-a-real-key',
      tools: 'read_only',
      repoUrl: root,
    })).rejects.toThrow();
    expect(existsSync(worktrees) ? readdirSync(worktrees) : []).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('pages pull request files past the first thirty', async () => {
    const previous = process.env.ARIA_GITHUB_MODE;
    process.env.ARIA_GITHUB_MODE = 'live';
    try {
      const base = process.env.GITHUB_API_BASE || '';
      const files = Array.from({ length: 31 }, (_, index) => `src/file-${index}.ts`);
      const created = await fetch(`${base}/repos/acme/pages/pulls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'pages', head: 'aria', base: 'main', body: 'files', files }),
      });
      const pull = await created.json() as { number: number };
      const names = await getPullFiles('token', 'acme/pages', pull.number);
      expect(names).toHaveLength(31);
      expect(names[30]).toBe('src/file-30.ts');
    } finally {
      if (previous === undefined) delete process.env.ARIA_GITHUB_MODE;
      else process.env.ARIA_GITHUB_MODE = previous;
    }
  });

  it('treats ANTHROPIC_ENABLED=false as off', () => {
    const parsed = parseEnv({ ...process.env, ANTHROPIC_ENABLED: 'false' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.ANTHROPIC_ENABLED).toBe(false);
  });

  it('counts prompt and tool text when the usage total is missing', () => {
    expect(fallbackTokenEstimate('abcd', ['tool', 'note'])).toBe(1 + 1 + 1);
    expect(fallbackTokenEstimate('', [])).toBe(0);
  });

  it('maps an invalid planner key to a non-retryable error', () => {
    const error = asRunError(new Error('Invalid User API Key'));
    expect(error.code).toBe('KEY_INVALID');
    expect(error.retryable).toBe(false);
  });

  it('refreshes a catalog older than 24 hours', () => {
    expect(catalogIsStale(null, Date.now())).toBe(true);
    expect(catalogIsStale(new Date(Date.now() - 25 * 60 * 60 * 1000), Date.now())).toBe(true);
    expect(catalogIsStale(new Date(), Date.now())).toBe(false);
  });
});

const zeroMix = { business: 0, qa: 0, frontend: 0, backend: 0, fullstack: 0, junior: 0, aiml: 0, devops: 0, security: 0 };

describe('company roster and knowledge merge', () => {
  it('accepts a validated AI roster and rejects a manager cycle', async () => {
    const accepted = await acceptCompanyPlan({
      size: 3,
      mix: zeroMix,
      seed: 'roster',
      flows: [],
      agents: [
        { roleKey: 'ceo', realName: 'Maya Chen', roleTitle: 'Chief Executive Officer', department: 'Leadership', managerIndex: null, backupIndex: 1, description: 'Leads.', instructions: 'Do not merge.', skills: ['strategy'], flows: [] },
        { roleKey: 'cto', realName: 'Luis Ortega', roleTitle: 'Chief Technology Officer', department: 'Engineering', managerIndex: 0, backupIndex: 0, description: 'Architecture.', instructions: 'Keep it small.', skills: ['architecture'], flows: [] },
        { roleKey: 'product_owner', realName: 'Amelia Brooks', roleTitle: 'Product Owner', department: 'Product', managerIndex: 0, backupIndex: 0, description: 'Backlog.', instructions: 'Write criteria.', skills: ['backlog'], flows: [] },
      ],
    });
    expect(accepted?.agents.find((agent) => agent.slug === 'ceo')?.realName).toBe('Maya Chen');
    const cycled = await acceptCompanyPlan({
      size: 3,
      mix: zeroMix,
      seed: 'roster',
      flows: [],
      agents: [
        { roleKey: 'ceo', realName: 'Maya Chen', roleTitle: 'Chief Executive Officer', department: 'Leadership', managerIndex: null, backupIndex: 1, description: 'Leads.', instructions: 'Do not merge.', skills: [], flows: [] },
        { roleKey: 'cto', realName: 'Luis Ortega', roleTitle: 'Chief Technology Officer', department: 'Engineering', managerIndex: 2, backupIndex: 0, description: 'Architecture.', instructions: 'Keep it small.', skills: [], flows: [] },
        { roleKey: 'product_owner', realName: 'Amelia Brooks', roleTitle: 'Product Owner', department: 'Product', managerIndex: 1, backupIndex: 0, description: 'Backlog.', instructions: 'Write criteria.', skills: [], flows: [] },
      ],
    });
    expect(cycled).toBeNull();
  });

  it('updates flows and stack and keeps an owner-edited layer', () => {
    const merged = mergeKnowledgeState({
      summary: 'Signup lets a user create an account.',
      flowNames: ['Signup'],
      techStack: [{ name: 'Node' }],
      modules: [{ name: 'web', path: 'apps/web/package.json', fileCount: 1 }],
      apis: [],
      dataModel: [],
      flows: [{
        id: 'flow-1', flowKey: 'signup', name: 'Signup', kind: 'ui', description: 'old', layer: 'backend',
        entryPoints: ['apps/web/src/app/signup/page.tsx'], hasOwner: true,
      }],
      knownPaths: new Set(['apps/web/package.json', 'apps/web/src/app/signup/page.tsx']),
      ai: {
        summary: 'Rewritten map without the signup word.',
        techStack: [{ name: 'TypeScript', evidence: 'package.json' }],
        modules: [
          { name: 'web', path: 'apps/web/package.json', fileCount: 2 },
          { name: 'invented', path: 'no/such/file.ts', fileCount: 1 },
        ],
        flows: [
          { flowKey: 'signup', name: 'Signup', kind: 'ui', layer: 'frontend', description: 'Account creation.', entryPoints: ['apps/web/src/app/signup/page.tsx', 'missing/page.tsx'] },
          { flowKey: 'billing', name: 'Billing', kind: 'api', layer: 'backend', description: 'Invoices.', entryPoints: ['apps/web/package.json'] },
        ],
        apis: [],
        dataModel: [],
      },
    });
    expect(merged.summary.toLowerCase()).toContain('signup');
    expect(merged.modules.map((mod) => mod.path)).toEqual(['apps/web/package.json']);
    expect(merged.techStack).toEqual([{ name: 'TypeScript', evidence: 'package.json' }]);
    expect(merged.updates[0].layer).toBe('backend');
    expect(merged.updates[0].description).toBe('Account creation.');
    expect(merged.updates[0].entryPoints).toEqual(['apps/web/src/app/signup/page.tsx']);
    expect(merged.inserts.map((flow) => flow.flowKey)).toEqual(['billing']);
  });
});
