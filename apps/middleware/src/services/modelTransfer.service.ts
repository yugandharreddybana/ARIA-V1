/**
 * /model-transfer (V27.9 §6).
 *
 * Zero-token tool that reads the canonical `.entiresystem/` knowledge store and writes
 * `.backend/<workspace>/` artefacts that downstream agents consume during prompt assembly:
 *   - file_index.json   — { path, sha256, byte_size } for every brain file
 *   - skill_headers.json— frontmatter-only index of every SKILL.md (Sprint 11 lazy loading)
 *   - experience.json   — concatenated experience.yml across all skills, scored by veracity
 *   - prompts/<persona>.md — prompt templates per persona (Sprint 11 fills these out)
 *
 * NO LLM CALLS. NO NETWORK. Pure file IO so the daemon can refresh `.backend/` on every
 * `.entiresystem/` change without burning tokens.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ExperienceService } from './experience.service';
import { rank } from './veracity.service';

export interface ModelTransferResult {
  workspace: string;
  filesIndexed: number;
  skillsIndexed: number;
  experienceEntries: number;
  outputDir: string;
}

interface SkillHeader {
  slug: string;
  frontmatter: Record<string, string | string[]>;
  bodyPath: string;
  bodyHash: string;
}

export class ModelTransferService {
  constructor(private readonly repoRoot: string) {}

  /** Build a fresh `.backend/<workspace>/` workspace from the current `.entiresystem/` tree. */
  run(workspace = 'default'): ModelTransferResult {
    const root = resolve(this.repoRoot);
    const out  = resolve(root, '.backend', workspace);
    mkdirSync(out, { recursive: true });
    mkdirSync(join(out, 'prompts'), { recursive: true });

    const fileIndex   = this.buildFileIndex(root);
    const skillIndex  = this.buildSkillIndex(root);
    const experience  = this.buildExperienceDigest(root);

    writeFileSync(join(out, 'file_index.json'),    JSON.stringify(fileIndex,  null, 2));
    writeFileSync(join(out, 'skill_headers.json'), JSON.stringify(skillIndex, null, 2));
    writeFileSync(join(out, 'experience.json'),    JSON.stringify(experience, null, 2));

    // Persona prompt-template stubs — Sprint 11 (skill ecosystem) renders the real ones.
    for (const h of skillIndex) {
      writeFileSync(join(out, 'prompts', `${h.slug}.md`),
        `# Prompt template for ${h.slug}\n\n` +
        `See ${h.bodyPath} for the full SKILL.md.\n` +
        `Description: ${h.frontmatter.description ?? '(missing)'}\n`);
    }

    return {
      workspace,
      filesIndexed: fileIndex.length,
      skillsIndexed: skillIndex.length,
      experienceEntries: experience.entries.length,
      outputDir: out,
    };
  }

  private buildFileIndex(root: string): Array<{ path: string; sha256: string; bytes: number }> {
    const start = resolve(root, '.entiresystem');
    if (!existsSync(start)) return [];
    const out: Array<{ path: string; sha256: string; bytes: number }> = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        // Skip the inner .gitignore'd subtrees (embeddings/, */temp/) and dotfiles.
        if (name.startsWith('.')) continue;
        if (name === 'embeddings' || name === 'temp') continue;
        const abs = join(dir, name);
        const st  = statSync(abs);
        if (st.isDirectory()) { walk(abs); continue; }
        const rel = relative(root, abs);
        const buf = readFileSync(abs);
        out.push({ path: rel, sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
      }
    };
    walk(start);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  private buildSkillIndex(root: string): SkillHeader[] {
    const skillsDir = resolve(root, '.entiresystem/skills');
    if (!existsSync(skillsDir)) return [];
    const headers: SkillHeader[] = [];
    for (const slug of readdirSync(skillsDir)) {
      const skillPath = join(skillsDir, slug, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const body = readFileSync(skillPath, 'utf-8');
      headers.push({
        slug,
        frontmatter: parseFrontmatter(body),
        bodyPath: relative(root, skillPath),
        bodyHash: createHash('sha256').update(body).digest('hex'),
      });
    }
    return headers.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  private buildExperienceDigest(root: string): {
    generatedAt: string;
    entries: Array<{ skill: string; kind: 'best_practice' | 'anti_pattern' | 'failure_story'; text: string; veracity: string; score: number }>;
  } {
    const svc = new ExperienceService(root);
    const generatedAt = new Date().toISOString();
    const entries: Array<{ skill: string; kind: 'best_practice' | 'anti_pattern' | 'failure_story'; text: string; veracity: string; score: number }> = [];
    for (const slug of svc.listSkills()) {
      const exp = svc.read(slug);
      for (const r of rank(exp.best_practices))  entries.push({ skill: slug, kind: 'best_practice',  text: r.entry.text,          veracity: r.veracity, score: r.score });
      for (const r of rank(exp.anti_patterns))   entries.push({ skill: slug, kind: 'anti_pattern',   text: r.entry.text,          veracity: r.veracity, score: r.score });
      for (const r of rank(exp.failure_stories)) entries.push({ skill: slug, kind: 'failure_story',  text: `${(r.entry as { description: string }).description}`, veracity: r.veracity, score: r.score });
    }
    return { generatedAt, entries };
  }
}

/** Tiny YAML-frontmatter parser — handles flat keys + simple `[a, b, c]` arrays. */
function parseFrontmatter(body: string): Record<string, string | string[]> {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string | string[]> = {};
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\r/g, '');
    const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    const val = mm[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else {
      out[key] = val.replace(/^"|"$/g, '');
    }
  }
  return out;
}

/** Convenience for tests + tools. */
export function modelTransferOutputDir(repoRoot: string, workspace = 'default'): string {
  return resolve(repoRoot, '.backend', workspace);
}

// Keeps the unused `dirname` import from breaking strict TS — we may use it for future
// workspace selection by file path.
void dirname;
