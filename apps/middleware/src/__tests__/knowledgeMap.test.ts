import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeMap, fetchPriority, isHomepagePath, MOCK_REPO_FILES, MOCK_REPO_PATHS } from '../services/knowledgeMap';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', '.next', 'coverage', '.turbo']);

function walkRepo(root: string, dir = root): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkRepo(root, full));
    else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return found;
}

describe('buildKnowledgeMap', () => {
  it('finds the stack, signup, login, homepage, and data entities from structure', () => {
    const map = buildKnowledgeMap(MOCK_REPO_PATHS, MOCK_REPO_FILES);
    expect(map.techStack.map((tech) => tech.name)).toEqual(expect.arrayContaining(['Next.js', 'React', 'PostgreSQL']));
    expect(map.flows.map((flow) => flow.flowKey)).toEqual(expect.arrayContaining(['signup', 'login', 'homepage']));
    expect(map.dataModel.map((entity) => entity.name)).toEqual(expect.arrayContaining(['User', 'Session']));
    expect(map.summary.toLowerCase()).toContain('signup');
    const login = map.flows.find((flow) => flow.flowKey === 'login');
    expect(login?.entryPoints.some((entry) => entry.includes('signing-key') || entry.endsWith('.md') || entry.includes('/e2e/'))).toBe(false);
    const homepage = map.flows.find((flow) => flow.flowKey === 'homepage');
    expect(homepage?.entryPoints.every((entry) => isHomepagePath(entry))).toBe(true);
    expect(homepage?.entryPoints.some((entry) => /\/(login|signup|ai)\//.test(entry))).toBe(false);
    expect(map.dataModel.map((entity) => entity.name)).not.toContain('slug');
  });

  it('reads this repository and keeps manifests ahead of page files', () => {
    const root = path.resolve(__dirname, '../../../..');
    const paths = walkRepo(root);
    const ranked = paths
      .map((file) => ({ file, rank: fetchPriority(file) }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.file.length - b.file.length)
      .slice(0, 25)
      .map((entry) => entry.file);
    expect(ranked).toContain('package.json');
    expect(ranked).toContain('apps/web/package.json');
    expect(ranked).toContain('apps/middleware/package.json');
    const files = ranked.map((file) => ({
      path: file,
      text: fs.readFileSync(path.join(root, file), 'utf8').slice(0, 20_000),
    }));
    const map = buildKnowledgeMap(paths, files);
    expect(map.techStack.map((tech) => tech.name)).toEqual(expect.arrayContaining(['Next.js', 'React', 'Express']));
    const homepage = map.flows.find((flow) => flow.flowKey === 'homepage');
    expect(homepage?.entryPoints.length).toBeGreaterThan(0);
    expect(homepage?.entryPoints.every((entry) => isHomepagePath(entry))).toBe(true);
    expect(homepage?.entryPoints.some((entry) => /\/(login|signup|ai)\//.test(entry))).toBe(false);
    const login = map.flows.find((flow) => flow.flowKey === 'login');
    expect(login?.entryPoints.some((entry) => entry.includes('signing-key') || entry.endsWith('.md') || entry.includes('/e2e/'))).toBe(false);
    const auth = map.flows.find((flow) => flow.flowKey === 'auth-api');
    expect(auth?.entryPoints.some((entry) => entry.includes('/e2e/') || entry.includes('.spec.'))).toBe(false);
    const names = map.dataModel.map((entity) => entity.name);
    expect(names.some((name) => name === 'projects' || name === 'skills' || name === 'users')).toBe(true);
    expect(names).not.toContain('slug');
    expect(names).not.toContain('identifier');
  });
});
