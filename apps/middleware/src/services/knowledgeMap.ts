/**
 * Pure knowledge-map builder. Callers pass repo paths and a few file bodies.
 * No network and no model calls live here.
 */

export interface RepoFile {
  path: string;
  text: string;
}

export interface KnowledgeTech {
  name: string;
  evidence: string;
}

export interface KnowledgeModule {
  name: string;
  path: string;
  fileCount: number;
}

export interface KnowledgeFlow {
  flowKey: string;
  name: string;
  kind: 'ui' | 'api' | 'data' | 'other';
  description: string;
  entryPoints: string[];
}

export interface KnowledgeApi {
  method: string;
  path: string;
  source: string;
}

export interface KnowledgeDataEntity {
  name: string;
  source: string;
}

export interface KnowledgeMapDraft {
  techStack: KnowledgeTech[];
  modules: KnowledgeModule[];
  flows: KnowledgeFlow[];
  apis: KnowledgeApi[];
  dataModel: KnowledgeDataEntity[];
  summary: string;
}

const FLOW_RULES: Array<{ flowKey: string; name: string; kind: KnowledgeFlow['kind']; match: (path: string) => boolean }> = [
  { flowKey: 'signup', name: 'Signup', kind: 'ui', match: (path) => segmentEquals(path, /^(sign[-_ ]?up|register)$/i) },
  { flowKey: 'login', name: 'Login', kind: 'ui', match: (path) => segmentEquals(path, /^(log[-_ ]?in|sign[-_ ]?in)$/i) },
  { flowKey: 'homepage', name: 'Homepage', kind: 'ui', match: isHomepagePath },
  { flowKey: 'auth-api', name: 'Auth API', kind: 'api', match: isAuthApiPath },
];

/** Tests, docs, and generated trees are not business flows. */
export function isFlowCandidate(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (/(^|\/)(node_modules|dist|coverage|target|\.next|\.git)(\/|$)/.test(normalized)) return false;
  if (/(^|\/)(e2e|__tests__|docs|test|tests)(\/|$)/i.test(normalized)) return false;
  if (/\.(spec|test)\.(tsx?|jsx?|mjs|cjs)$/i.test(normalized)) return false;
  if (/\.md$/i.test(normalized)) return false;
  return true;
}

/** App-router root page only. Nested routes and route groups are not the homepage. */
export function isHomepagePath(path: string): boolean {
  if (!isFlowCandidate(path)) return false;
  const stripped = path.replace(/\\/g, '/').replace(/\/\([^/]+\)/g, '');
  return /(^|\/)app\/page\.(tsx|jsx)$/.test(stripped);
}

function isAuthApiPath(path: string): boolean {
  if (!isFlowCandidate(path)) return false;
  return /\/api\/auth(\/|$)/i.test(path)
    || /\/auth\.(routes|controller)\.(ts|js)$/i.test(path)
    || /\/routes\/auth\.(ts|js)$/i.test(path);
}

function segmentEquals(path: string, pattern: RegExp): boolean {
  if (!isFlowCandidate(path)) return false;
  return path.split(/[\\/]/).some((segment) => {
    const base = segment.replace(/\.[^.]+$/, '');
    return pattern.test(base);
  });
}

function readDeps(packageJson: string): string[] {
  try {
    const parsed = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Object.keys({ ...parsed.dependencies, ...parsed.devDependencies });
  } catch {
    return [];
  }
}

function manifestRank(path: string): number {
  if (path === 'package.json' || path === 'pom.xml') return 0;
  return path.split('/').length;
}

const TECH_HINTS: Array<{ name: string; test: (paths: string[], deps: string[], files: RepoFile[]) => boolean }> = [
  { name: 'Next.js', test: (_p, deps) => deps.includes('next') },
  { name: 'React', test: (_p, deps) => deps.includes('react') },
  { name: 'Express', test: (_p, deps) => deps.includes('express') },
  { name: 'Spring Boot', test: (paths, _deps, files) => files.some((file) => file.path.endsWith('pom.xml')) || paths.some((p) => p.endsWith('pom.xml') || p.includes('src/main/java')) },
  { name: 'PostgreSQL', test: (paths, deps) => deps.includes('pg') || paths.some((p) => p.endsWith('.sql') && isFlowCandidate(p)) },
  { name: 'Prisma', test: (paths, deps) => deps.includes('prisma') || paths.some((p) => p.endsWith('schema.prisma')) },
  { name: 'Python', test: (paths) => paths.some((p) => p.endsWith('requirements.txt') || p.endsWith('.py')) },
  { name: 'Go', test: (paths) => paths.some((p) => p.endsWith('go.mod')) },
];

function dataEntities(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
    /\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/g,
    /\bpgTable\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g,
    /@Entity(?:\s*\(\s*(?:name\s*=\s*)?["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\))?[\s\S]{0,200}?\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    for (const hit of text.matchAll(pattern)) {
      const name = hit[2] || hit[1];
      if (name) names.push(name);
    }
  }
  return names;
}

/** Higher scores are fetched first so manifests are not crowded out by page files. */
export function fetchPriority(path: string): number {
  const base = path.split('/').pop() ?? path;
  if (/^(package\.json|pom\.xml|go\.mod|Cargo\.toml|requirements\.txt)$/i.test(path)) return 100;
  if (/^(package\.json|pom\.xml|go\.mod|schema\.prisma|Cargo\.toml)$/i.test(base)) return 80;
  if (/\/schema\/.+\.ts$/.test(path) || path.endsWith('.sql')) return isFlowCandidate(path) || path.includes('/schema/') ? 70 : 0;
  if (/route\.(ts|js)$/.test(base) && isFlowCandidate(path)) return 50;
  if (isHomepagePath(path) || (isFlowCandidate(path) && segmentEquals(path, /^(log[-_ ]?in|sign[-_ ]?in|sign[-_ ]?up|register)$/i))) return 40;
  return 0;
}

export function buildKnowledgeMap(paths: string[], files: RepoFile[]): KnowledgeMapDraft {
  const capped = paths.slice(0, 2000);
  const manifests = files
    .filter((file) => /(?:^|\/)(package\.json|pom\.xml)$/.test(file.path) && !file.path.includes('node_modules'))
    .sort((a, b) => manifestRank(a.path) - manifestRank(b.path));
  const deps = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.path.endsWith('package.json')) {
      for (const dep of readDeps(manifest.text)) deps.add(dep);
    }
  }
  const depList = [...deps];
  const techStack = TECH_HINTS.filter((hint) => hint.test(capped, depList, files)).map((hint) => ({
    name: hint.name,
    evidence: hint.name === 'Spring Boot' || hint.name === 'Python' || hint.name === 'Go' ? 'repository paths' : 'package.json',
  }));

  const moduleCounts = new Map<string, number>();
  for (const path of capped) {
    if (!isFlowCandidate(path) && /node_modules|\.git/.test(path)) continue;
    const parts = path.split('/').filter(Boolean);
    const top = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join('/') : parts[0] ?? 'root';
    moduleCounts.set(top, (moduleCounts.get(top) ?? 0) + 1);
  }
  const modules = [...moduleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([path, fileCount]) => ({ name: path.split('/').pop() ?? path, path, fileCount }));

  const flows: KnowledgeFlow[] = [];
  for (const rule of FLOW_RULES) {
    const hits = capped.filter((path) => rule.match(path)).slice(0, 8);
    if (hits.length > 0) {
      flows.push({
        flowKey: rule.flowKey,
        name: rule.name,
        kind: rule.kind,
        description: `${rule.name} is implemented in ${hits.length} path${hits.length === 1 ? '' : 's'}.`,
        entryPoints: hits,
      });
    }
  }

  const apis: KnowledgeApi[] = [];
  for (const file of files) {
    if (!isFlowCandidate(file.path) && !/route\.(ts|js)$/.test(file.path)) continue;
    if (apis.length >= 40) break;
    const routeHits = file.text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([/'"`][^'"`\s]{1,120})/g);
    for (const hit of routeHits) {
      apis.push({ method: hit[1], path: hit[2].replace(/^['"`]|['"`]$/g, ''), source: file.path });
      if (apis.length >= 40) break;
    }
    if (/route\.(ts|js)$/.test(file.path) && isFlowCandidate(file.path)) {
      apis.push({ method: 'ROUTE', path: `/${file.path.replace(/\/route\.(ts|js)$/, '')}`, source: file.path });
    }
  }

  const dataModel: KnowledgeDataEntity[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (/\.md$/i.test(file.path) || file.path.includes('/docs/')) continue;
    for (const name of dataEntities(file.text)) {
      if (dataModel.length >= 40) break;
      const key = `${name}@${file.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dataModel.push({ name, source: file.path });
    }
  }

  const flowNames = flows.map((flow) => flow.name).join(', ') || 'no named business flows yet';
  const techNames = techStack.map((tech) => tech.name).join(', ') || 'an unidentified stack';
  const summary = `Repository uses ${techNames}. Detected flows: ${flowNames}. ${modules.length} modules and ${dataModel.length} data entities were indexed from structure, not from a model.`;

  return { techStack, modules, flows, apis, dataModel, summary };
}

export const MOCK_REPO_PATHS = [
  'package.json',
  'README.md',
  'docs/adr/signing-key.md',
  'e2e/tests/auth/login.spec.ts',
  'prisma/schema.prisma',
  'src/app/page.tsx',
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/signup/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/api/auth/route.ts',
];

export const MOCK_REPO_FILES: RepoFile[] = [
  { path: 'package.json', text: '{"dependencies":{"next":"14.2.4","react":"18.3.1","pg":"8.12.0"}}' },
  { path: 'README.md', text: 'Demo shop. People sign up, log in, and land on the homepage. table slug' },
  { path: 'docs/adr/signing-key.md', text: 'The signing-key decision. model Session {' },
  { path: 'prisma/schema.prisma', text: 'model User { id String @id } model Session { id String @id }' },
  { path: 'src/app/api/auth/route.ts', text: 'export const POST = () => new Response("ok");\n// POST /api/auth\n' },
  { path: 'src/app/page.tsx', text: 'export default function Home(){ return null }' },
  { path: 'src/app/(auth)/login/page.tsx', text: 'export default function Login(){ return null }' },
  { path: 'src/app/(auth)/signup/page.tsx', text: 'export default function Signup(){ return null }' },
];
