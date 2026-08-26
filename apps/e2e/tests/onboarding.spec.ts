import { test, expect, type Page } from '@playwright/test';

/**
 * 6-step onboarding wizard — happy path + gate + GitHub-not-connected.
 *
 * External services (GitHub API, LLM providers, Postgres-backed middleware
 * routes) are mocked with page.route, following the established pattern in
 * tests/projects/projects.spec.ts, so this spec runs without a live GitHub
 * OAuth app or Ollama.
 */

const USER = {
  id: '00000000-0000-0000-0000-0000000000u1',
  workspaceId: '00000000-0000-0000-0000-0000000000w1',
  name: 'Test User',
  email: 'test@aria.dev',
  isActive: true,
  createdAt: '2026-08-26T00:00:00Z',
};

const SKILLS = [
  {
    tempId: '11111111-1111-1111-1111-111111111111',
    slug: 'ceo', realName: 'Alex Chen', roleTitle: 'Chief Executive Officer',
    department: 'C-Suite', hierarchyLevel: 1, reportingManagerTempId: null,
    instructions: 'You are the CEO.', description: 'Owns vision and strategy.',
    ownedDomains: ['strategy'], ownedRepoPaths: [], triggerKeywords: ['vision'],
    riskClass: 'A', isAlwaysPresent: true, isAiGenerated: true,
  },
  {
    tempId: '22222222-2222-2222-2222-222222222222',
    slug: 'qa-engineer', realName: 'Jordan Lee', roleTitle: 'QA Engineer',
    department: 'Engineering', hierarchyLevel: 5, reportingManagerTempId: '11111111-1111-1111-1111-111111111111',
    instructions: 'You test things.', description: 'Owns testing and quality gates.',
    ownedDomains: ['testing'], ownedRepoPaths: [], triggerKeywords: ['test'],
    riskClass: 'C', isAlwaysPresent: false, isAiGenerated: true,
  },
];

const okBody = (data: unknown) => ({ json: { ok: true, data } });

async function stubAuth(page: Page) {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: USER } }));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('aria_token', 'e2e-fake-token'));
}

test.describe('Onboarding wizard', () => {
  test('OB-01: dashboard redirects un-onboarded workspaces into the wizard', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/onboarding/status', route => route.fulfill(okBody({
      completed: false, onboardingCompletedAt: null, companyDescription: null,
      githubConnected: false, proposalStatus: null,
    })));
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    await expect(page.getByTestId('onboarding-step-1')).toBeVisible();
  });

  test('OB-02: onboarded workspaces skip the wizard', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/onboarding/status', route => route.fulfill(okBody({
      completed: true, onboardingCompletedAt: '2026-08-26T00:00:00Z', companyDescription: 'x',
      githubConnected: true, proposalStatus: 'committed',
    })));
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('OB-03: full happy path — company → LLM → repos → scout → review → commit', async ({ page }) => {
    await stubAuth(page);

    // ── API mocks ──
    await page.route('**/api/onboarding/status', route => route.fulfill(okBody({
      completed: false, onboardingCompletedAt: null, companyDescription: null,
      githubConnected: true, proposalStatus: null,
    })));
    await page.route('**/api/onboarding/company', route => route.fulfill(okBody({ message: 'Company saved' })));
    await page.route('**/api/workspace/llm-config', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: { config: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder:7b', hasApiKey: false } } });
      }
      return route.fulfill({ json: { success: true, config: {} } });
    });
    await page.route('**/api/onboarding/github/repos', route => route.fulfill(okBody([
      { id: 1, fullName: 'acme/web', name: 'web', description: 'Frontend', private: false, defaultBranch: 'main', language: 'TypeScript', updatedAt: '2026-08-01T00:00:00Z' },
      { id: 2, fullName: 'acme/api', name: 'api', description: 'Backend', private: true, defaultBranch: 'main', language: 'Go', updatedAt: '2026-08-02T00:00:00Z' },
    ])));
    await page.route('**/api/onboarding/repos', route => route.fulfill(okBody({ projectId: 'proj-1' })));
    await page.route('**/api/onboarding/scout', route => route.fulfill({ status: 202, ...okBody({ proposalId: 'prop-1' }) }));

    // Proposal: pending on first poll, ready afterwards
    let proposalPolls = 0;
    const proposalRow = (status: string, skills: unknown[]) => ({
      id: 'prop-1', workspaceId: USER.workspaceId, projectId: 'proj-1',
      status, proposedSkills: skills, errorMessage: null,
      createdAt: '2026-08-26T00:00:00Z', updatedAt: '2026-08-26T00:00:00Z',
    });
    await page.route('**/api/onboarding/proposal', route => {
      proposalPolls += 1;
      return route.fulfill(okBody(proposalPolls === 1
        ? proposalRow('pending', [])
        : proposalRow('ready', SKILLS)));
    });
    await page.route('**/api/onboarding/proposal/*', route => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill(okBody([SKILLS[0]]));
      }
      return route.fulfill(okBody(SKILLS));
    });
    await page.route('**/api/onboarding/commit', route => route.fulfill({
      status: 201, ...okBody({ projectId: 'proj-1', skillCount: 1, teamCount: 1 }),
    }));

    // ── Step 1: company ──
    await page.goto('/onboarding');
    await expect(page.getByTestId('onboarding-step-1')).toBeVisible();
    await page.getByTestId('company-name-input').fill('Acme Robotics');
    await page.getByTestId('company-description-input').fill('We build a robotics fleet-management SaaS.');
    await page.getByTestId('company-continue-btn').click();

    // ── Step 2: LLM (prefilled from workspace config) ──
    await expect(page.getByTestId('onboarding-step-2')).toBeVisible();
    await expect(page.getByTestId('llm-model-input')).toHaveValue('qwen2.5-coder:7b');
    await page.getByTestId('llm-continue-btn').click();

    // ── Step 3: repos ──
    await expect(page.getByTestId('onboarding-step-3')).toBeVisible();
    await expect(page.getByTestId('repo-list')).toBeVisible();
    await page.getByTestId('repo-item').filter({ hasText: 'acme/web' }).click();
    await expect(page.getByTestId('selected-repo-chip')).toHaveCount(1);
    await page.getByTestId('repos-continue-btn').click();

    // ── Step 4: scout ──
    await expect(page.getByTestId('onboarding-step-4')).toBeVisible();
    await expect(page.getByTestId('scout-name-input')).toHaveValue('Aria Scout');
    await page.getByTestId('scout-description-input').fill('Analyse the repos and propose the team.');
    await page.getByTestId('scout-continue-btn').click();

    // ── Step 5: poll → ready → review ──
    await expect(page.getByTestId('onboarding-step-5')).toBeVisible();
    await expect(page.getByTestId('proposal-ready')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('proposal-skill-card')).toHaveCount(2);

    // Required roles cannot be deleted; ICs can
    const ceoCard = page.getByTestId('proposal-skill-card').filter({ hasText: 'Chief Executive Officer' });
    await expect(ceoCard.getByTestId('skill-delete-btn')).toHaveCount(0);
    const qaCard = page.getByTestId('proposal-skill-card').filter({ hasText: 'QA Engineer' });
    await qaCard.getByTestId('skill-delete-btn').click();
    await expect(page.getByTestId('proposal-skill-card')).toHaveCount(1);

    await page.getByTestId('review-continue-btn').click();

    // ── Step 6: commit ──
    await expect(page.getByTestId('onboarding-step-6')).toBeVisible();
    await expect(page.getByTestId('commit-summary')).toBeVisible();
    await page.getByTestId('commit-btn').click();
    await expect(page.getByTestId('commit-success')).toBeVisible();
    await expect(page.getByTestId('commit-success')).toContainText('1 agents hired');
  });

  test('OB-04: GitHub-not-connected shows a clean fallback with manual repo entry', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/onboarding/status', route => route.fulfill(okBody({
      completed: false, onboardingCompletedAt: null, companyDescription: 'Already saved',
      githubConnected: false, proposalStatus: null,
    })));
    await page.route('**/api/onboarding/company', route => route.fulfill(okBody({ message: 'Company saved' })));
    await page.route('**/api/workspace/llm-config', route => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: { config: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder:7b', hasApiKey: false } } });
      }
      return route.fulfill({ json: { success: true, config: {} } });
    });
    await page.route('**/api/onboarding/github/repos', route => route.fulfill({
      status: 400,
      json: { success: false, error: 'GitHub not connected. Please complete GitHub OAuth first.', code: 'GITHUB_NOT_CONNECTED' },
    }));

    await page.goto('/onboarding');
    await page.getByTestId('company-name-input').fill('Acme');
    await page.getByTestId('company-description-input').fill('Robots.');
    await page.getByTestId('company-continue-btn').click();
    await page.getByTestId('llm-continue-btn').click();

    await expect(page.getByTestId('github-not-connected')).toBeVisible();
    await expect(page.getByTestId('github-not-connected')).toContainText('GitHub not connected');
    await expect(page.getByRole('button', { name: /connect github/i })).toBeVisible();

    // Manual fallback still lets the user continue
    await page.getByTestId('manual-repo-url-input').fill('https://github.com/acme/legacy');
    await page.getByTestId('add-manual-repo-btn').click();
    await expect(page.getByTestId('selected-repo-chip')).toContainText('acme/legacy');
    await expect(page.getByTestId('repos-continue-btn')).toBeEnabled();
  });
});
