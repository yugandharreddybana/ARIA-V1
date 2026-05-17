/**
 * Skill-Experience profile (V27.9 §9 + ADR-0008).
 *
 * Each skill stores its accumulated lessons in
 *   `.entiresystem/skills/<slug>/experience.yml`
 *
 * Schema:
 *   skill: <slug>
 *   tickets_touched: <int>
 *   best_practices:  [{ text, veracity, captured_at, notes? }]
 *   anti_patterns:   [{ text, veracity, captured_at, notes? }]
 *   failure_stories: [{ id, description, root_cause, resolution, veracity, captured_at }]
 *
 * The reader/writer here is dependency-free (no third-party YAML lib) — we use a small
 * structural parser specialised to this file shape, which keeps the middleware lean and
 * keeps the file format under git review-friendly diffs.
 *
 * Knowledge Veracity tags:
 *   - human-authored : never auto-modified
 *   - human-approved : drafted by an agent, accepted by a human via PR review
 *   - ai-only        : extracted by Shadow Learning, awaiting human approval
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type Veracity = 'human-authored' | 'human-approved' | 'ai-only';

export interface ExperienceEntry {
  text: string;
  veracity: Veracity;
  captured_at: string;
  notes?: string;
}

export interface FailureStory {
  id: string;
  description: string;
  root_cause: string;
  resolution: string;
  veracity: Veracity;
  captured_at: string;
}

export interface SkillExperience {
  skill: string;
  tickets_touched: number;
  best_practices: ExperienceEntry[];
  anti_patterns:  ExperienceEntry[];
  failure_stories: FailureStory[];
}

export class ExperienceService {
  constructor(private readonly repoRoot: string) {}

  private skillsDir(): string { return resolve(this.repoRoot, '.entiresystem/skills'); }
  private skillPath(slug: string): string { return resolve(this.skillsDir(), slug, 'experience.yml'); }

  listSkills(): string[] {
    const dir = this.skillsDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  }

  read(slug: string): SkillExperience {
    const path = this.skillPath(slug);
    if (!existsSync(path)) {
      return { skill: slug, tickets_touched: 0, best_practices: [], anti_patterns: [], failure_stories: [] };
    }
    return parseExperienceYaml(readFileSync(path, 'utf-8'), slug);
  }

  write(exp: SkillExperience): void {
    const path = this.skillPath(exp.skill);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeExperienceYaml(exp));
  }

  /** Append a new entry. Defaults to `ai-only` veracity; only humans should promote. */
  appendBestPractice(slug: string, text: string, veracity: Veracity = 'ai-only', notes?: string): SkillExperience {
    const exp = this.read(slug);
    if (!exp.best_practices.some(e => e.text === text)) {
      exp.best_practices.push({ text, veracity, captured_at: new Date().toISOString(), notes });
      this.write(exp);
    }
    return exp;
  }

  appendAntiPattern(slug: string, text: string, veracity: Veracity = 'ai-only', notes?: string): SkillExperience {
    const exp = this.read(slug);
    if (!exp.anti_patterns.some(e => e.text === text)) {
      exp.anti_patterns.push({ text, veracity, captured_at: new Date().toISOString(), notes });
      this.write(exp);
    }
    return exp;
  }

  appendFailureStory(slug: string, story: Omit<FailureStory, 'captured_at'> & { captured_at?: string }): SkillExperience {
    const exp = this.read(slug);
    if (!exp.failure_stories.some(s => s.id === story.id)) {
      exp.failure_stories.push({ ...story, captured_at: story.captured_at ?? new Date().toISOString() });
      this.write(exp);
    }
    return exp;
  }

  incrementTicketsTouched(slug: string, by = 1): SkillExperience {
    const exp = this.read(slug);
    exp.tickets_touched += by;
    this.write(exp);
    return exp;
  }
}

// ── Parser (dependency-free; tolerant of the canonical shape we write) ─────

const ENTRY_KEYS = ['text', 'veracity', 'captured_at', 'notes'];
const STORY_KEYS = ['id', 'description', 'root_cause', 'resolution', 'veracity', 'captured_at'];

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}

function parseExperienceYaml(yaml: string, fallbackSlug: string): SkillExperience {
  const out: SkillExperience = {
    skill: fallbackSlug, tickets_touched: 0,
    best_practices: [], anti_patterns: [], failure_stories: [],
  };

  type Section = null | 'best_practices' | 'anti_patterns' | 'failure_stories';
  let section: Section = null;
  let pending: Record<string, string> | null = null;
  let isStory = false;

  const flush = () => {
    if (!pending || !section) { pending = null; return; }
    if (section === 'failure_stories') {
      const v = (pending.veracity ?? 'ai-only') as Veracity;
      out.failure_stories.push({
        id: pending.id ?? '',
        description: pending.description ?? '',
        root_cause: pending.root_cause ?? '',
        resolution: pending.resolution ?? '',
        veracity: v,
        captured_at: pending.captured_at ?? new Date().toISOString(),
      });
    } else if (pending.text) {
      const v = (pending.veracity ?? 'ai-only') as Veracity;
      out[section].push({
        text: pending.text,
        veracity: v,
        captured_at: pending.captured_at ?? new Date().toISOString(),
        ...(pending.notes ? { notes: pending.notes } : {}),
      });
    }
    pending = null;
  };

  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/[\r]/g, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (/^skill:\s*/.test(line))           { out.skill = unquote(line.replace(/^skill:\s*/, '')); continue; }
    if (/^tickets_touched:\s*/.test(line)) { out.tickets_touched = Number(line.replace(/^tickets_touched:\s*/, '').trim()) || 0; continue; }
    if (/^best_practices:\s*(\[\])?$/.test(line))   { flush(); section = 'best_practices';  isStory = false; continue; }
    if (/^anti_patterns:\s*(\[\])?$/.test(line))    { flush(); section = 'anti_patterns';   isStory = false; continue; }
    if (/^failure_stories:\s*(\[\])?$/.test(line))  { flush(); section = 'failure_stories'; isStory = true;  continue; }

    if (section && /^\s+- /.test(line)) {
      flush();
      pending = {};
      const tail = line.replace(/^\s+- /, '');
      const m = tail.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (m) pending[m[1]] = unquote(m[2]);
      continue;
    }
    if (section && pending && /^\s+[a-zA-Z_]+:\s*/.test(line)) {
      const m = line.match(/^\s+([a-zA-Z_]+):\s*(.*)$/);
      if (m) {
        const allowed = isStory ? STORY_KEYS : ENTRY_KEYS;
        if (allowed.includes(m[1])) pending[m[1]] = unquote(m[2]);
      }
    }
  }
  flush();
  return out;
}

function serializeExperienceYaml(exp: SkillExperience): string {
  const lines: string[] = [];
  lines.push(`skill: ${exp.skill}`);
  lines.push(`tickets_touched: ${exp.tickets_touched}`);

  const writeEntries = (key: 'best_practices' | 'anti_patterns', entries: ExperienceEntry[]) => {
    if (entries.length === 0) { lines.push(`${key}: []`); return; }
    lines.push(`${key}:`);
    for (const e of entries) {
      lines.push(`  - text: ${q(e.text)}`);
      lines.push(`    veracity: ${e.veracity}`);
      lines.push(`    captured_at: ${q(e.captured_at)}`);
      if (e.notes) lines.push(`    notes: ${q(e.notes)}`);
    }
  };
  writeEntries('best_practices', exp.best_practices);
  writeEntries('anti_patterns',  exp.anti_patterns);

  if (exp.failure_stories.length === 0) {
    lines.push(`failure_stories: []`);
  } else {
    lines.push(`failure_stories:`);
    for (const s of exp.failure_stories) {
      lines.push(`  - id: ${q(s.id)}`);
      lines.push(`    description: ${q(s.description)}`);
      lines.push(`    root_cause: ${q(s.root_cause)}`);
      lines.push(`    resolution: ${q(s.resolution)}`);
      lines.push(`    veracity: ${s.veracity}`);
      lines.push(`    captured_at: ${q(s.captured_at)}`);
    }
  }
  return lines.join('\n') + '\n';
}

function q(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Convenience helper for tests + tools that need an absolute repo root. */
export function resolveExperiencePath(repoRoot: string, slug: string): string {
  return join(resolve(repoRoot), '.entiresystem/skills', slug, 'experience.yml');
}
