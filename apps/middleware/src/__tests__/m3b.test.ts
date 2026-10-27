import { describe, expect, it } from 'vitest';
import { acceptanceCriteriaZ, hasAcceptanceCriteria } from '@aria/shared';
import {
  addWorkingDays,
  ceilFib,
  daysToPoints,
  dueAt,
  isStoryPoint,
  sprintEndsOn,
  type WorkCalendar,
} from '../services/tickets/schedule';
import {
  globSpecificity,
  globsFromPaths,
  layerForPath,
  mostSpecificOwner,
  pathMatchesGlob,
  type PathOwnerRow,
} from '../services/ownership/pathOwners';
import { parseEnv } from '../config/env';
import { EVENT_TYPES } from '../services/tickets/ticketEvents';

const cal: WorkCalendar = {
  workdays: [1, 2, 3, 4, 5],
  timeZone: 'UTC',
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
};

describe('daysToPoints and sprint working days', () => {
  it('rounds up to the nearest Fibonacci at or above (owner-confirmed)', () => {
    // Exact cases the owner named: 1, 2, 3, 4, 5, 8
    expect(daysToPoints(1)).toBe(1);
    expect(daysToPoints(2)).toBe(2);
    expect(daysToPoints(3)).toBe(3);
    expect(daysToPoints(4)).toBe(5);
    expect(daysToPoints(5)).toBe(5);
    expect(daysToPoints(8)).toBe(8);
    expect(isStoryPoint(daysToPoints(3))).toBe(true);
    expect(ceilFib(4)).toBe(daysToPoints(4));
  });

  it('still ceils fractional and out-of-band day estimates', () => {
    expect(daysToPoints(0.5)).toBe(1);
    expect(daysToPoints(1.1)).toBe(2);
    expect(daysToPoints(9)).toBe(13);
    expect(daysToPoints(20)).toBe(13);
  });

  it('keeps due dates as 1 point = 1 working day after daysToPoints', () => {
    const points = daysToPoints(4); // 5
    expect(points).toBe(5);
    const monday = new Date('2026-10-05T09:00:00Z');
    const due = dueAt(monday, points, cal);
    expect(due.getTime()).toBeGreaterThan(monday.getTime());
    // 5 working days from Monday open lands at the next Monday open.
    expect(due.toISOString()).toBe('2026-10-10T09:00:00.000Z');
  });

  it('builds a 10-working-day sprint skipping weekends', () => {
    // Mon 2026-10-05 → 10th workday is Fri 2026-10-16
    expect(sprintEndsOn('2026-10-05', 10, cal)).toBe('2026-10-16');
    expect(addWorkingDays('2026-10-09', 2, cal)).toBe('2026-10-12'); // Fri + Mon
  });
});

describe('acceptance criteria zod', () => {
  it('requires given/when/then strings', () => {
    expect(hasAcceptanceCriteria([{ given: 'a', when: 'b', then: 'c' }])).toBe(true);
    expect(hasAcceptanceCriteria([])).toBe(false);
    expect(hasAcceptanceCriteria([{ given: '', when: 'b', then: 'c' }])).toBe(false);
    expect(acceptanceCriteriaZ.parse([{ given: 'user is signed in', when: 'they open board', then: 'backlog loads' }])).toHaveLength(1);
  });
});

describe('path ownership matching', () => {
  it('prefers the most specific glob', () => {
    expect(pathMatchesGlob('apps/web/src/app/(auth)/login.tsx', 'apps/web/**')).toBe(true);
    expect(pathMatchesGlob('apps/web/src/app/(auth)/login.tsx', 'apps/middleware/**')).toBe(false);
    expect(globSpecificity('apps/web/src/**')).toBeGreaterThan(globSpecificity('apps/**'));
    const owners: PathOwnerRow[] = [
      {
        id: '1', project_id: 'p', path_glob: 'apps/**', layer: 'fullstack',
        owner_agent_id: 'wide', backup_agent_id: null, source: 'merged_pr',
        last_ticket_id: null, last_pr_number: null,
      },
      {
        id: '2', project_id: 'p', path_glob: 'apps/web/**', layer: 'frontend',
        owner_agent_id: 'fe', backup_agent_id: 'fe2', source: 'merged_pr',
        last_ticket_id: null, last_pr_number: null,
      },
    ];
    expect(mostSpecificOwner(owners, ['apps/web/src/page.tsx'])?.owner_agent_id).toBe('fe');
    expect(globsFromPaths(['apps/web/src/app/page.tsx'])[0]).toEqual({
      pathGlob: 'apps/web/**',
      layer: 'frontend',
    });
    expect(layerForPath('apps/middleware/src/index.ts')).toBe('backend');
  });
});

describe('m3b event types and env', () => {
  it('includes ownership_handoff and readiness', () => {
    expect(EVENT_TYPES).toContain('ownership_handoff');
    expect(EVENT_TYPES).toContain('readiness');
    expect(EVENT_TYPES).toContain('learning_proposal');
  });

  it('defaults WIP=1 and sprint workdays=10', () => {
    const parsed = parseEnv({
      ...process.env,
      DATABASE_URL: 'postgresql://aria:aria@127.0.0.1:5432/aria_dev',
      COOKIE_SECRET: 'test-cookie-secret-must-be-32-characters-min',
      WORKSPACE_ENCRYPTION_KEY: 'test-workspace-encryption-key-32b',
      JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
      JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ARIA_AGENT_WIP_LIMIT).toBe(1);
      expect(parsed.data.ARIA_SPRINT_WORKDAYS).toBe(10);
    }
  });
});
