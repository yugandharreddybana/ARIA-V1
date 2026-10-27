import { validateEnv } from '../../config/env';
import { AppError } from '../../middleware/error.middleware';
import { getPgPool } from '../db.client';
import { parseWorkdays, sprintEndsOn, type WorkCalendar } from './schedule';
import { workCalendar } from './ticketActions';

export interface SprintRow {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  starts_on: string;
  ends_on: string;
  status: 'planned' | 'active' | 'closed';
  created_at: Date;
}

function asIsoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function serializeSprint(row: SprintRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    goal: row.goal,
    startsOn: asIsoDate(row.starts_on),
    endsOn: asIsoDate(row.ends_on),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listSprints(projectId: string): Promise<SprintRow[]> {
  const result = await getPgPool().query<SprintRow>(
    `SELECT id, project_id, name, goal, starts_on::text AS starts_on, ends_on::text AS ends_on, status, created_at
       FROM sprints WHERE project_id = $1::uuid ORDER BY starts_on DESC`,
    [projectId],
  );
  return result.rows;
}

export async function getSprint(sprintId: string, projectId: string): Promise<SprintRow> {
  const result = await getPgPool().query<SprintRow>(
    `SELECT id, project_id, name, goal, starts_on::text AS starts_on, ends_on::text AS ends_on, status, created_at
       FROM sprints WHERE id = $1::uuid AND project_id = $2::uuid`,
    [sprintId, projectId],
  );
  if (!result.rows[0]) throw new AppError('Sprint not found', 404, 'NOT_FOUND');
  return result.rows[0];
}

export async function createSprint(input: {
  projectId: string;
  name: string;
  goal?: string | null;
  startsOn: string;
  endsOn?: string | null;
  status?: 'planned' | 'active' | 'closed';
}): Promise<SprintRow> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) {
    throw new AppError('startsOn must be YYYY-MM-DD', 400, 'VALIDATION_ERROR');
  }
  const env = validateEnv();
  const cal: WorkCalendar = workCalendar();
  const endsOn = input.endsOn && /^\d{4}-\d{2}-\d{2}$/.test(input.endsOn)
    ? input.endsOn
    : sprintEndsOn(input.startsOn, env.ARIA_SPRINT_WORKDAYS, cal);
  if (input.endsOn && endsOn < input.startsOn) {
    throw new AppError('endsOn must be on or after startsOn', 400, 'VALIDATION_ERROR');
  }
  if (input.status === 'active') {
    await getPgPool().query(
      `UPDATE sprints SET status = 'planned' WHERE project_id = $1::uuid AND status = 'active'`,
      [input.projectId],
    );
  }
  const result = await getPgPool().query<SprintRow>(
    `INSERT INTO sprints (project_id, name, goal, starts_on, ends_on, status)
     VALUES ($1::uuid, $2, $3, $4::date, $5::date, $6)
     RETURNING id, project_id, name, goal, starts_on::text AS starts_on, ends_on::text AS ends_on, status, created_at`,
    [input.projectId, input.name.trim(), input.goal ?? null, input.startsOn, endsOn, input.status ?? 'planned'],
  );
  return result.rows[0]!;
}

export async function updateSprint(input: {
  sprintId: string;
  projectId: string;
  name?: string;
  goal?: string | null;
  status?: 'planned' | 'active' | 'closed';
}): Promise<SprintRow> {
  await getSprint(input.sprintId, input.projectId);
  if (input.status === 'active') {
    await getPgPool().query(
      `UPDATE sprints SET status = 'planned' WHERE project_id = $1::uuid AND status = 'active' AND id <> $2::uuid`,
      [input.projectId, input.sprintId],
    );
  }
  const result = await getPgPool().query<SprintRow>(
    `UPDATE sprints SET
        name = COALESCE($3, name),
        goal = COALESCE($4, goal),
        status = COALESCE($5, status)
      WHERE id = $1::uuid AND project_id = $2::uuid
      RETURNING id, project_id, name, goal, starts_on::text AS starts_on, ends_on::text AS ends_on, status, created_at`,
    [input.sprintId, input.projectId, input.name ?? null, input.goal ?? null, input.status ?? null],
  );
  return result.rows[0]!;
}

/** Exported for tests: default calendar from env workdays. */
export function sprintCalendarFromEnv(): WorkCalendar {
  const env = validateEnv();
  return {
    workdays: parseWorkdays(env.ARIA_WORKDAYS),
    timeZone: env.ARIA_TIMEZONE,
    startMinutes: 9 * 60,
    endMinutes: 18 * 60,
  };
}
