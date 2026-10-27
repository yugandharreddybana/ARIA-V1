import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunRow } from '../services/runs/runQueue';
import { clearTrackedCliChildren, createCliCodeWorker } from '../services/providers/cliWorker';

function fakeRun(id = '11111111-1111-4111-8111-111111111111'): AgentRunRow {
  return {
    id,
    workspace_id: '22222222-2222-4222-8222-222222222222',
    project_id: '33333333-3333-4333-8333-333333333333',
    agent_id: null,
    ticket_id: null,
    parent_run_id: null,
    activity: 'develop',
    task_type: 'coding',
    runtime: 'cursor_cloud',
    status: 'running',
    blocked_reason: null,
    priority: 0,
    idempotency_key: `cli-${id}`,
    attempt: 1,
    max_attempts: 3,
    not_before: new Date(),
    lease_owner: null,
    lease_expires_at: null,
    heartbeat_at: null,
    model_id: null,
    model_params: [],
    external_agent_id: null,
    external_run_id: null,
    external_url: null,
    stream_cursor: null,
    repo_id: null,
    base_ref: null,
    head_sha: null,
    branch: null,
    pr_url: null,
    pr_number: null,
    input: {},
    prompt_text: null,
    result_text: null,
    result_json: null,
    output_source: null,
    error_code: null,
    error_message: null,
    tokens_reserved: 0,
    budget_project_scoped: null,
    tokens_input: null,
    tokens_output: null,
    tokens_cache_read: null,
    tokens_cache_write: null,
    tokens_total: null,
    created_at: new Date(),
    started_at: new Date(),
    finished_at: null,
    updated_at: new Date(),
  } as AgentRunRow;
}

const auth = {
  apiKey: 'k',
  repoUrl: 'https://github.com/acme/demo',
};

afterEach(() => {
  clearTrackedCliChildren();
});

describe('createCliCodeWorker process tracking', () => {
  it('marks finished when the child exits 0 and keeps stdout', async () => {
    const worker = createCliCodeWorker({
      binary: process.execPath,
      argsFor: () => ['-e', 'process.stdout.write("hello-ok"); process.exit(0)'],
      timeoutMs: 5_000,
    });
    const events: string[] = [];
    const ref = await worker.start({
      run: fakeRun(),
      apiKey: 'k',
      repoUrl: 'https://github.com/acme/demo',
      prompt: 'hi',
      autoCreatePR: false,
      workOnCurrentBranch: true,
    });
    const snap = await worker.follow(ref, null, (kind, text) => { events.push(`${kind}:${text}`); }, auth);
    expect(snap.status).toBe('finished');
    expect(snap.resultText).toContain('hello-ok');
    expect(events.some((line) => line.includes('exited 0'))).toBe(true);
  });

  it('marks error when the child exits non-zero', async () => {
    const worker = createCliCodeWorker({
      binary: process.execPath,
      argsFor: () => ['-e', 'process.stderr.write("boom"); process.exit(7)'],
      timeoutMs: 5_000,
    });
    const ref = await worker.start({
      run: fakeRun('44444444-4444-4444-8444-444444444444'),
      apiKey: 'k',
      repoUrl: 'https://github.com/acme/demo',
      prompt: 'hi',
      autoCreatePR: false,
      workOnCurrentBranch: true,
    });
    const snap = await worker.follow(ref, null, () => undefined, auth);
    expect(snap.status).toBe('error');
    expect(snap.resultText).toMatch(/boom|7/);
  });

  it('marks error and kills the child on timeout', async () => {
    const worker = createCliCodeWorker({
      binary: process.execPath,
      argsFor: () => ['-e', 'setTimeout(() => {}, 60_000)'],
      timeoutMs: 200,
    });
    const ref = await worker.start({
      run: fakeRun('55555555-5555-4555-8555-555555555555'),
      apiKey: 'k',
      repoUrl: 'https://github.com/acme/demo',
      prompt: 'hi',
      autoCreatePR: false,
      workOnCurrentBranch: true,
    });
    const started = Date.now();
    const snap = await worker.follow(ref, null, () => undefined, auth);
    expect(snap.status).toBe('error');
    expect(snap.resultText).toMatch(/timeout/i);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
