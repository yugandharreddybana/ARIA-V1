import { Sanitizer } from '../sanitizer.service';
import {
  assignFlowRows,
  generateCompany,
  type CompanyMix,
  type FlowAssignment,
  type FlowRef,
  type GeneratedAgent,
} from '../companyGenerator';

const LAYERS = ['frontend', 'backend', 'fullstack'] as const;
type Layer = typeof LAYERS[number];

export interface PlannedAgent {
  roleKey: string;
  realName: string;
  roleTitle: string;
  department: string;
  managerIndex: number | null;
  backupIndex: number | null;
  description: string;
  instructions: string;
  skills: string[];
  flows: Array<{ flowKey: string; layer: string; role: string }>;
}

export interface AcceptedRoster {
  agents: GeneratedAgent[];
  assignments: FlowAssignment[];
}

function counts(keys: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const key of keys) map.set(key, (map.get(key) ?? 0) + 1);
  return map;
}

function sameCounts(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function acyclicToCeo(managers: Array<number | null>, ceo: number): boolean {
  for (let start = 0; start < managers.length; start++) {
    const seen = new Set<number>();
    let cursor: number | null = start;
    let reached = false;
    while (cursor != null) {
      if (cursor === ceo) {
        reached = true;
        break;
      }
      if (seen.has(cursor) || cursor < 0 || cursor >= managers.length) return false;
      seen.add(cursor);
      cursor = managers[cursor];
    }
    if (!reached) return false;
  }
  return true;
}

async function clean(sanitizer: Sanitizer, value: string, fallback: string, max: number): Promise<string> {
  const sliced = value.trim().slice(0, max);
  if (!sliced) return fallback;
  const result = await sanitizer.sanitize(sliced);
  if (result.trustLabel === 'rejected' || !result.cleaned.trim()) return fallback.slice(0, max);
  return result.cleaned.trim().slice(0, max);
}

export async function acceptCompanyPlan(input: {
  size: number;
  mix: CompanyMix;
  seed: string;
  flows: FlowRef[];
  agents: PlannedAgent[];
}): Promise<AcceptedRoster | null> {
  let template: ReturnType<typeof generateCompany>;
  try {
    template = generateCompany({ size: input.size, mix: input.mix, seed: input.seed, flows: input.flows });
  } catch {
    return null;
  }
  const enabled = template.agents.filter((agent) => agent.enabled);
  if (input.agents.length !== enabled.length) return null;
  if (!sameCounts(counts(input.agents.map((agent) => agent.roleKey)), counts(enabled.map((agent) => agent.roleKey)))) return null;
  const names = input.agents.map((agent) => agent.realName.trim().toLowerCase());
  if (new Set(names).size !== names.length) return null;
  const ceo = input.agents.findIndex((agent) => agent.roleKey === 'ceo' && agent.managerIndex == null);
  if (ceo < 0) return null;
  if (input.agents.filter((agent) => agent.roleKey === 'ceo').length !== 1) return null;
  const managers = input.agents.map((agent) => agent.managerIndex);
  if (!acyclicToCeo(managers, ceo)) return null;

  const sanitizer = new Sanitizer();
  const unused = [...enabled];
  const agents: GeneratedAgent[] = [];
  const templateIdToNew = new Map<string, string>();
  for (let index = 0; index < input.agents.length; index++) {
    const planned = input.agents[index];
    const slot = unused.findIndex((agent) => agent.roleKey === planned.roleKey);
    if (slot < 0) return null;
    const base = unused.splice(slot, 1)[0];
    templateIdToNew.set(base.tempId, `ai-${index + 1}`);
    const realName = await clean(sanitizer, planned.realName, base.realName, 255);
    agents.push({
      ...base,
      tempId: `ai-${index + 1}`,
      realName,
      roleTitle: await clean(sanitizer, planned.roleTitle, base.roleTitle, 200),
      department: await clean(sanitizer, planned.department, base.department, 100),
      description: await clean(sanitizer, planned.description, base.description, 500),
      instructions: await clean(sanitizer, planned.instructions, base.instructions, 1500),
      skills: planned.skills.length ? planned.skills.map((skill) => skill.slice(0, 80)).slice(0, 12) : base.skills,
      ownedFlowIds: [],
      managerTempId: null,
      backupTempId: null,
      roleKey: base.roleKey,
    });
  }
  const seenNames = new Set<string>();
  for (const agent of agents) {
    const key = agent.realName.toLowerCase();
    if (seenNames.has(key)) return null;
    seenNames.add(key);
  }
  for (let index = 0; index < agents.length; index++) {
    const managerIndex = input.agents[index].managerIndex;
    agents[index].managerTempId = managerIndex == null ? null : agents[managerIndex]?.tempId ?? null;
    const backupIndex = input.agents[index].backupIndex;
    const backup = backupIndex == null ? null : agents[backupIndex];
    agents[index].backupTempId = backup && backup.tempId !== agents[index].tempId ? backup.tempId : null;
  }
  for (const agent of agents) {
    if (agent.backupTempId) continue;
    const other = agents.find((candidate) => candidate.tempId !== agent.tempId);
    agent.backupTempId = other?.tempId ?? null;
  }
  for (const extra of template.agents.filter((agent) => !agent.enabled)) {
    agents.push({
      ...extra,
      ownedFlowIds: [],
      managerTempId: extra.managerTempId ? templateIdToNew.get(extra.managerTempId) ?? null : null,
      backupTempId: extra.backupTempId ? templateIdToNew.get(extra.backupTempId) ?? null : null,
    });
  }

  const assignments: FlowAssignment[] = [];
  const flowsByKey = new Map(input.flows.map((flow) => [flow.flowKey, flow]));
  for (let index = 0; index < input.agents.length; index++) {
    for (const flow of input.agents[index].flows) {
      const known = flowsByKey.get(flow.flowKey);
      if (!known) continue;
      const layer: Layer = LAYERS.includes(flow.layer as Layer) ? flow.layer as Layer : 'fullstack';
      const role = flow.role === 'backup' ? 'backup' : flow.role === 'owner' ? 'owner' : null;
      if (!role) continue;
      assignments.push({ flowId: known.id, layer, role, agentTempId: agents[index].tempId });
    }
  }
  const owned = new Set(assignments.filter((row) => row.role === 'owner').map((row) => row.flowId));
  const missing = input.flows.filter((flow) => !owned.has(flow.id));
  if (missing.length) {
    const filled = assignFlowRows(agents.filter((agent) => agent.enabled), missing);
    assignments.push(...filled.assignments);
  }
  return { agents, assignments };
}
