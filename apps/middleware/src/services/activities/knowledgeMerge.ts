export function mergeSummary(draft: string, ai: string, flowNames: string[]): string {
  const missing = flowNames.filter((name) => !ai.toLowerCase().includes(name.toLowerCase()));
  if (!missing.length) return ai.slice(0, 2000);
  return `${ai.slice(0, 1600)} Detected flows: ${flowNames.join(', ')}.`.slice(0, 2000);
}

export interface MergeFlow {
  id: string;
  flowKey: string;
  name: string;
  kind: string;
  description: string;
  layer: string;
  entryPoints: string[];
  hasOwner: boolean;
}

export interface MergeModule {
  name: string;
  path: string;
  fileCount?: number;
}

export interface AiKnowledge {
  summary: string;
  techStack: Array<{ name: string; evidence?: string }>;
  modules: MergeModule[];
  flows: Array<{ flowKey: string; name: string; kind?: string; layer?: string; description?: string; entryPoints?: string[] }>;
  apis: Array<{ method?: string; path?: string; source?: string }>;
  dataModel: Array<{ name?: string; source?: string }>;
}

const LAYERS = new Set(['frontend', 'backend', 'fullstack']);
const KINDS = new Set(['ui', 'api', 'data', 'other']);

function known(path: string, paths: Set<string>): boolean {
  if (!path) return false;
  if (paths.size === 0) return false;
  return paths.has(path.replace(/\\/g, '/'));
}

export function mergeKnowledgeState(input: {
  summary: string;
  flowNames: string[];
  techStack: unknown[];
  modules: MergeModule[];
  apis: unknown[];
  dataModel: unknown[];
  flows: MergeFlow[];
  ai: AiKnowledge;
  knownPaths: Set<string>;
}): {
  summary: string;
  techStack: unknown[];
  modules: MergeModule[];
  apis: unknown[];
  dataModel: unknown[];
  updates: MergeFlow[];
  inserts: Array<Omit<MergeFlow, 'id' | 'hasOwner'>>;
} {
  const summary = mergeSummary(input.summary, input.ai.summary, input.flowNames);
  const modules = input.ai.modules
    .filter((mod) => known(mod.path, input.knownPaths))
    .map((mod) => ({ name: mod.name.slice(0, 200), path: mod.path, fileCount: mod.fileCount ?? 1 }));
  const techStack = input.ai.techStack.length
    ? input.ai.techStack.map((tech) => ({ name: tech.name.slice(0, 80), evidence: (tech.evidence || 'ai').slice(0, 200) }))
    : input.techStack;
  const apis = input.ai.apis.filter((api) => !api.source || known(api.source, input.knownPaths));
  const dataModel = input.ai.dataModel.filter((entity) => !entity.source || known(entity.source, input.knownPaths));
  const byKey = new Map(input.ai.flows.map((flow) => [flow.flowKey, flow]));
  const updates: MergeFlow[] = [];
  for (const flow of input.flows) {
    const ai = byKey.get(flow.flowKey);
    if (!ai) continue;
    const entryPoints = (ai.entryPoints ?? []).filter((entry) => known(entry, input.knownPaths) || flow.entryPoints.includes(entry));
    const layer = !flow.hasOwner && ai.layer && LAYERS.has(ai.layer) ? ai.layer : flow.layer;
    updates.push({
      ...flow,
      name: ai.name.slice(0, 200) || flow.name,
      description: (ai.description ?? flow.description).slice(0, 2000),
      kind: ai.kind && KINDS.has(ai.kind) ? ai.kind : flow.kind,
      layer,
      entryPoints: entryPoints.length ? entryPoints : flow.entryPoints,
    });
  }
  const existingKeys = new Set(input.flows.map((flow) => flow.flowKey));
  const inserts = input.ai.flows
    .filter((flow) => !existingKeys.has(flow.flowKey))
    .map((flow) => ({
      flowKey: flow.flowKey.slice(0, 80),
      name: flow.name.slice(0, 200),
      kind: flow.kind && KINDS.has(flow.kind) ? flow.kind : 'other',
      description: (flow.description ?? '').slice(0, 2000),
      layer: flow.layer && LAYERS.has(flow.layer) ? flow.layer : 'fullstack',
      entryPoints: (flow.entryPoints ?? []).filter((entry) => known(entry, input.knownPaths)),
    }))
    .filter((flow) => flow.entryPoints.length > 0);
  return {
    summary,
    techStack,
    modules: modules.length ? modules : input.modules,
    apis: input.ai.apis.length ? apis : input.apis,
    dataModel: input.ai.dataModel.length ? dataModel : input.dataModel,
    updates,
    inserts,
  };
}
