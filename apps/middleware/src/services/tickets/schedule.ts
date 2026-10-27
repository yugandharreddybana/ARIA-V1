export const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;
export type StoryPoint = typeof STORY_POINTS[number];

export interface WorkCalendar {
  workdays: number[];
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isStoryPoint(value: number): value is StoryPoint {
  return (STORY_POINTS as readonly number[]).includes(value);
}

export function splitSuggested(points: number): boolean {
  return points > 8;
}

/**
 * Ceil a day estimate to the next Fibonacci story point.
 * Only for day→points conversion; stored points stay 1 pt = 1 working day.
 */
export function ceilFib(days: number): StoryPoint {
  if (!Number.isFinite(days) || days <= 0) return 1;
  for (const point of STORY_POINTS) {
    if (days <= point) return point;
  }
  return 13;
}

/** Add N working days (Sat/Sun off by default via cal.workdays). Returns YYYY-MM-DD in cal timezone. */
export function addWorkingDays(startIsoDate: string, workingDays: number, cal: WorkCalendar): string {
  if (!Number.isInteger(workingDays) || workingDays < 1) throw new Error('working days must be a positive integer');
  const [y, m, d] = startIsoDate.split('-').map(Number);
  let cursor = zonedDateTime(y, m, d, 12, 0, cal.timeZone);
  let remaining = workingDays;
  for (let guard = 0; guard < 4000 && remaining > 0; guard++) {
    const parts = zonedParts(cursor, cal.timeZone);
    if (cal.workdays.includes(parts.isoWeekday)) {
      remaining -= 1;
      if (remaining === 0) {
        return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  throw new Error('could not place sprint end date');
}

/** Sprint length in working days (default 10). ends_on is the Nth working day from starts_on inclusive. */
export function sprintEndsOn(startsOn: string, workdays: number, cal: WorkCalendar): string {
  return addWorkingDays(startsOn, workdays, cal);
}

/** Length buckets. The planning agent replaces this when it creates the ticket. */
export function estimatePoints(title: string, description: string): StoryPoint {
  const len = title.trim().length + description.trim().length;
  if (len < 80) return 1;
  if (len < 200) return 2;
  if (len < 400) return 3;
  if (len < 800) return 5;
  if (len < 1600) return 8;
  return 13;
}

export function parseMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((part) => Number(part));
  return h * 60 + m;
}

export function parseWorkdays(raw: string): number[] {
  const days = raw.split(',').map((part) => Number(part.trim())).filter((day) => day >= 1 && day <= 7);
  return days.length ? days : [1, 2, 3, 4, 5];
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    isoWeekday: WEEKDAY[bag.weekday] ?? 1,
  };
}

/** UTC instant of a wall-clock time in `timeZone`. One correction pass is enough away from DST folds. */
export function zonedDateTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = zonedParts(new Date(guess), timeZone);
  const asUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return new Date(guess - (asUtc - guess));
}

function atMinutes(parts: ZonedParts, minutes: number, timeZone: string): Date {
  return zonedDateTime(parts.year, parts.month, parts.day, Math.floor(minutes / 60), minutes % 60, timeZone);
}

function nextWorkStart(parts: ZonedParts, cal: WorkCalendar): Date {
  const noon = zonedDateTime(parts.year, parts.month, parts.day, 12, 0, cal.timeZone);
  const shifted = zonedParts(new Date(noon.getTime() + 24 * 60 * 60 * 1000), cal.timeZone);
  return atMinutes(shifted, cal.startMinutes, cal.timeZone);
}

/**
 * 1 point is one working day of working time (open through close).
 * Minutes are consumed from the effective start: before open counts from open,
 * after close or a weekend counts from the next open.
 */
export function dueAt(startedAt: Date, points: number, cal: WorkCalendar): Date {
  if (!Number.isInteger(points) || points < 1) throw new Error('story points must be a positive integer');
  const dayLength = cal.endMinutes - cal.startMinutes;
  if (dayLength <= 0) throw new Error('workday end must be after the start');
  let remaining = points * dayLength;
  let cursor = startedAt;
  for (let guard = 0; guard < 4000 && remaining > 0; guard++) {
    const parts = zonedParts(cursor, cal.timeZone);
    const open = atMinutes(parts, cal.startMinutes, cal.timeZone);
    const close = atMinutes(parts, cal.endMinutes, cal.timeZone);
    const workday = cal.workdays.includes(parts.isoWeekday);
    if (!workday || cursor.getTime() >= close.getTime()) {
      cursor = nextWorkStart(parts, cal);
      continue;
    }
    const start = cursor.getTime() < open.getTime() ? open : cursor;
    const available = Math.max(0, Math.round((close.getTime() - start.getTime()) / 60_000));
    if (available > remaining) return new Date(start.getTime() + remaining * 60_000);
    remaining -= available;
    cursor = nextWorkStart(parts, cal);
    if (remaining === 0) return cursor;
  }
  throw new Error('could not place a due date');
}

export function budgetedMs(points: number, cal: WorkCalendar): number {
  return points * (cal.endMinutes - cal.startMinutes) * 60_000;
}

export function workingMsBetween(start: Date, end: Date, cal: WorkCalendar): number {
  if (end.getTime() <= start.getTime()) return 0;
  let cursor = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (let guard = 0; guard < 400 && cursor < endMs; guard++) {
    const parts = zonedParts(new Date(cursor), cal.timeZone);
    const open = atMinutes(parts, cal.startMinutes, cal.timeZone).getTime();
    const close = atMinutes(parts, cal.endMinutes, cal.timeZone).getTime();
    if (cal.workdays.includes(parts.isoWeekday)) {
      const from = Math.max(open, cursor);
      const to = Math.min(close, endMs);
      if (to > from) total += to - from;
    }
    cursor = nextWorkStart(parts, cal).getTime();
  }
  return total;
}

export type ScheduleState = 'not_started' | 'on_track' | 'at_risk' | 'overdue' | 'done';

export function scheduleState(input: {
  startedAt: Date | null;
  dueAt: Date | null;
  points: number;
  now: Date;
  terminal: boolean;
  riskRatio: number;
  cal: WorkCalendar;
}): ScheduleState {
  if (input.terminal) return 'done';
  if (!input.startedAt || !input.dueAt) return 'not_started';
  if (input.now.getTime() > input.dueAt.getTime()) return 'overdue';
  const elapsed = workingMsBetween(input.startedAt, input.now, input.cal);
  const budget = budgetedMs(input.points, input.cal);
  if (budget > 0 && elapsed >= budget * input.riskRatio) return 'at_risk';
  return 'on_track';
}
