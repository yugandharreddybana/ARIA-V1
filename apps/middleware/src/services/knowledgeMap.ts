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

const FLOW_RULES: Array<{ flowKey: string; name: string; kind: KnowledgeFlow['kind']; pattern: RegExp }> = [
  { flowKey: 'signup', name: 'Signup', kind: 'ui', pattern: /(sign[-_ ]?up|register)/i },
  { flowKey: 'login', name: 'Login', kind: 'ui', pattern: /(log[-_ ]?in|signin|sign-in)/i },
  { flowKey: 'homepage', name: 'Homepage', kind: 'ui', pattern: /(^|\/)(page|home|index)\.(tsx|jsx|vue|html)$/i },
  { flowKey: 'auth-api', name: 'Auth API', kind: 'api', pattern: /\/(api\/)?auth\//i },
];

function readDeps(packageJson: string): string[] {
  try {
    const parsed = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Object.keys({ ...parsed.dependencies, ...parsed.devDependencies });
  } catch {
    return [];
  }
}

const TECH_HINTS: Array<{ name: string; test: (paths: string[], deps: string[]) => boolean }> = [
  { name: 'Next.js', test: (_p, deps) => deps.includes('next') },
  { name: 'React', test: (_p, deps) => deps.includes('react') },
  { name: 'Express', test: (_p, deps) => deps.includes('express') },
  { name: 'Spring Boot', test: (paths) => paths.some((p) => p.endsWith('pom.xml') || p.includes('src/main/java')) },
  { name: 'PostgreSQL', test: (paths, deps) => deps.includes('pg') || paths.some((p) => p.endsWith('.sql')) },
  { name: 'Prisma', test: (paths, deps) => deps.includes('prisma') || paths.some((p) => p.endsWith('schema.prisma')) },
  { name: 'Python', test: (paths) => paths.some((p) => p.endsWith('requirements.txt') || p.endsWith('.py')) },
  { name: 'Go', test: (paths) => paths.some((p) => p.endsWith('go.mod')) },
];

export function buildKnowledgeMap(paths: string[], files: RepoFile[]): KnowledgeMapDraft {
  const capped = paths.slice(0, 2000);
  const packageFile = files.find((file) => file.path.endsWith('package.json') && !file.path.includes('node_modules'));
  const deps = packageFile ? readDeps(packageFile.text) : [];
  const techStack = TECH_HINTS.filter((hint) => hint.test(capped, deps)).map((hint) => ({
    name: hint.name,
    evidence: hint.name === 'Next.js' || hint.name === 'React' || hint.name === 'Express' || hint.name === 'Prisma' || hint.name === 'PostgreSQL'
      ? 'package.json'
      : 'repository paths',
  }));

  const moduleCounts = new Map<string, number>();
  for (const path of capped) {
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
    const hits = capped.filter((path) => rule.pattern.test(path)).slice(0, 8);
    if (hits.length === 0 && rule.flowKey === 'homepage') {
      const home = capped.find((path) => /(^|\/)page\.tsx$/.test(path) && !/auth|login|signup/i.test(path));
      if (home) {
        flows.push({ flowKey: rule.flowKey, name: rule.name, kind: rule.kind, description: `${rule.name} is served from ${home}.`, entryPoints: [home] });
      }
      continue;
    }
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
    if (apis.length >= 40) break;
    const routeHits = file.text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([/'"`][^'"`\s]{1,120})/g);
    for (const hit of routeHits) {
      apis.push({ method: hit[1], path: hit[2].replace(/^['"`]|['"`]$/g, ''), source: file.path });
      if (apis.length >= 40) break;
    }
    if (/route\.(ts|js)$/.test(file.path)) {
      apis.push({ method: 'ROUTE', path: `/${file.path.replace(/\/route\.(ts|js)$/, '')}`, source: file.path });
    }
  }

  const dataModel: KnowledgeDataEntity[] = [];
  for (const file of files) {
    const models = file.text.matchAll(/(?:model|table|CREATE TABLE(?: IF NOT EXISTS)?)\s+([A-Za-z_][A-Za-z0-9_]*)/g);
    for (const hit of models) {
      if (dataModel.length >= 40) break;
      dataModel.push({ name: hit[1], source: file.path });
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
  'prisma/schema.prisma',
  'src/app/page.tsx',
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/signup/page.tsx',
  'src/app/api/auth/route.ts',
];

export const MOCK_REPO_FILES: RepoFile[] = [
  { path: 'package.json', text: '{"dependencies":{"next":"14.2.4","react":"18.3.1","pg":"8.12.0"}}' },
  { path: 'README.md', text: 'Demo shop. People sign up, log in, and land on the homepage.' },
  { path: 'prisma/schema.prisma', text: 'model User { id String @id } model Session { id String @id }' },
  { path: 'src/app/api/auth/route.ts', text: 'export const POST = () => new Response("ok");\n// POST /api/auth\n' },
  { path: 'src/app/page.tsx', text: 'export default function Home(){ return null }' },
  { path: 'src/app/(auth)/login/page.tsx', text: 'export default function Login(){ return null }' },
  { path: 'src/app/(auth)/signup/page.tsx', text: 'export default function Signup(){ return null }' },
];
