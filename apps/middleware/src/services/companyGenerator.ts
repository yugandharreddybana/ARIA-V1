/**
 * Single company generator for ARIA.
 * Produces a sized org of real-role agents. Instructions come from lean
 * docs/agents/skills/*.json (extends _base) so generation works without a chat API.
 * Later milestones attach to roleKey, enabled, backupAgentId, ownedFlowIds.
 */

// catalogue.generated.cjs loads in both CJS (vitest/tsc) and strip-types ESM child.
import { composeInstructions } from './agentSkills/catalogue.generated.cjs';

export const ROLE_KEYS = [
  'ceo', 'cfo', 'cto', 'business', 'product_owner', 'scrum_master',
  'ui_ux_designer',
  'frontend', 'backend', 'fullstack', 'junior', 'aiml', 'qa', 'devops',
  'cybersecurity', 'red_team', 'blue_team', 'research', 'coach',
  'documentation', 'pr_coordinator',
] as const;

export type RoleKey = typeof ROLE_KEYS[number];

export interface CompanyMix {
  business: number;
  qa: number;
  frontend: number;
  backend: number;
  fullstack: number;
  junior: number;
  aiml: number;
  devops: number;
  security: number;
}

export interface FlowRef {
  id: string;
  flowKey: string;
  name: string;
  kind: string;
}

export interface GeneratedAgent {
  tempId: string;
  slug: string;
  realName: string;
  roleKey: RoleKey;
  roleTitle: string;
  department: string;
  hierarchyLevel: number;
  managerTempId: string | null;
  backupTempId: string | null;
  instructions: string;
  description: string;
  skills: string[];
  ownedFlowIds: string[];
  enabled: boolean;
}

export interface FlowAssignment {
  flowId: string;
  layer: 'frontend' | 'backend' | 'fullstack';
  role: 'owner' | 'backup';
  agentTempId: string;
}

export interface GenerateCompanyInput {
  size: number;
  mix: CompanyMix;
  seed: string;
  flows?: FlowRef[];
}

const NAMES = [
  'Maya Chen', 'Luis Ortega', 'Amelia Brooks', 'Noah Patel', 'Sofia Rossi',
  'Jonah Adler', 'Priya Nair', 'Elena Vasquez', 'Caleb Nguyen', 'Hannah Berg',
  'Omar Farouk', 'Grace Kim', 'Leo Martins', 'Aisha Rahman', 'Felix Novak',
  'Chloe Dubois', 'Isaac Cohen', 'Nora Lindgren', 'Mateo Silva', 'Hana Sato',
  'Elliot Fraser', 'Layla Haddad', 'Owen Clarke', 'Freya Nielsen', 'Julian Park',
  'Mina Kowalski', 'Theo Almeida', 'Ruby Sanders', 'Adrian Popov', 'Leila Mensah',
  'Simon Bergstrom', 'Yara Costa', 'Nathan Doyle', 'Ines Moreau', 'Hugo Ferreira',
  'Clara Weiss', 'Malik Johnson', 'Esme Laurent', 'Victor Almeida', 'Nadia Petrov',
  'Callum Reid', 'Amina Diallo', 'Oscar Lind', 'Bianca Romano', 'Harun Demir',
  'Ivy Thompson', 'Rafael Santos', 'Mei Lin', 'Patrick Byrne', 'Sana Iqbal',
];

const MIX_KEYS = ['business', 'qa', 'frontend', 'backend', 'fullstack', 'junior', 'aiml', 'devops', 'security'] as const;

interface Seat {
  roleKey: RoleKey;
  roleTitle: string;
  department: string;
  hierarchyLevel: number;
  managerRole: RoleKey | null;
  skills: string[];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled role ${String(value)}`);
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function seatFor(roleKey: RoleKey, index: number): Seat {
  const n = index > 0 ? ` ${index + 1}` : '';
  switch (roleKey) {
    case 'ceo':
      return { roleKey, roleTitle: 'Chief Executive Officer', department: 'Leadership', hierarchyLevel: 1, managerRole: null, skills: ['strategy', 'priorities', 'stakeholder updates'] };
    case 'cfo':
      return { roleKey, roleTitle: 'Chief Financial Officer', department: 'Leadership', hierarchyLevel: 2, managerRole: 'ceo', skills: ['cost review', 'token budgets', 'value tradeoffs'] };
    case 'cto':
      return { roleKey, roleTitle: 'Chief Technology Officer', department: 'Engineering', hierarchyLevel: 2, managerRole: 'ceo', skills: ['architecture', 'technical direction', 'risk'] };
    case 'business':
      return { roleKey, roleTitle: `Business Strategist${n}`, department: 'Business', hierarchyLevel: 3, managerRole: 'ceo', skills: ['market fit', 'customer outcomes'] };
    case 'product_owner':
      return { roleKey, roleTitle: 'Product Owner', department: 'Product', hierarchyLevel: 3, managerRole: 'ceo', skills: ['backlog', 'acceptance criteria', 'user value'] };
    case 'scrum_master':
      return { roleKey, roleTitle: 'Scrum Master', department: 'Delivery', hierarchyLevel: 3, managerRole: 'product_owner', skills: ['flow', 'blockers', 'ceremonies'] };
    case 'ui_ux_designer':
      return { roleKey, roleTitle: 'UI/UX Designer', department: 'Product', hierarchyLevel: 4, managerRole: 'product_owner', skills: ['html mocks', 'state coverage', 'design review'] };
    case 'frontend':
      return { roleKey, roleTitle: `Frontend Engineer${n}`, department: 'Engineering', hierarchyLevel: 5, managerRole: 'cto', skills: ['ui', 'accessibility', 'client state'] };
    case 'backend':
      return { roleKey, roleTitle: `Backend Engineer${n}`, department: 'Engineering', hierarchyLevel: 5, managerRole: 'cto', skills: ['apis', 'data', 'auth'] };
    case 'fullstack':
      return { roleKey, roleTitle: `Full-Stack Engineer${n}`, department: 'Engineering', hierarchyLevel: 5, managerRole: 'cto', skills: ['ui', 'apis', 'end-to-end delivery'] };
    case 'junior':
      return { roleKey, roleTitle: `Junior Engineer${n}`, department: 'Engineering', hierarchyLevel: 5, managerRole: 'cto', skills: ['implementation', 'tests', 'learning'] };
    case 'aiml':
      return { roleKey, roleTitle: `AI/ML Engineer${n}`, department: 'AI', hierarchyLevel: 5, managerRole: 'cto', skills: ['model integration', 'evaluation', 'prompts'] };
    case 'qa':
      return { roleKey, roleTitle: `QA Engineer${n}`, department: 'Quality', hierarchyLevel: 5, managerRole: 'scrum_master', skills: ['test plans', 'regression', 'ui checks'] };
    case 'devops':
      return { roleKey, roleTitle: `DevOps Engineer${n}`, department: 'Platform', hierarchyLevel: 5, managerRole: 'cto', skills: ['ci', 'environments', 'operability'] };
    case 'cybersecurity':
      return { roleKey, roleTitle: `Cybersecurity Engineer${n}`, department: 'Security', hierarchyLevel: 5, managerRole: 'cto', skills: ['authn', 'secrets', 'access control'] };
    case 'red_team':
      return { roleKey, roleTitle: `Red Team Engineer${n}`, department: 'Security', hierarchyLevel: 5, managerRole: 'cto', skills: ['attack simulation', 'injection', 'auth bypass'] };
    case 'blue_team':
      return { roleKey, roleTitle: `Blue Team Engineer${n}`, department: 'Security', hierarchyLevel: 5, managerRole: 'cto', skills: ['fixes', 'detection', 'hardening'] };
    case 'research':
      return { roleKey, roleTitle: 'Research Analyst', department: 'Research', hierarchyLevel: 3, managerRole: 'ceo', skills: ['options', 'sources', 'tradeoffs'] };
    case 'coach':
      return { roleKey, roleTitle: 'Learning Coach', department: 'Research', hierarchyLevel: 3, managerRole: 'ceo', skills: ['skill growth', 'token discipline'] };
    case 'documentation':
      return { roleKey, roleTitle: 'Documentation Lead', department: 'Product', hierarchyLevel: 4, managerRole: 'product_owner', skills: ['workflows', 'diagrams', 'api docs'] };
    case 'pr_coordinator':
      return { roleKey, roleTitle: 'PR Merge Coordinator', department: 'Delivery', hierarchyLevel: 4, managerRole: 'cto', skills: ['merge order', 'overlap', 'rebase advice'] };
    default:
      return assertNever(roleKey);
  }
}

function leadershipFor(size: number): RoleKey[] {
  const roles: RoleKey[] = ['ceo'];
  if (size >= 2) roles.push('cto');
  if (size >= 3) roles.push('product_owner');
  if (size >= 5) roles.push('scrum_master');
  if (size >= 8) roles.push('cfo');
  // M3 D13 seed extras when seats allow (ON); otherwise ALWAYS_PRESENT keeps them OFF.
  if (size >= 12) {
    roles.push('ui_ux_designer', 'documentation', 'research', 'coach', 'pr_coordinator');
  }
  return roles.slice(0, size);
}

function expandSecurity(index: number): RoleKey {
  const order: RoleKey[] = ['cybersecurity', 'red_team', 'blue_team'];
  return order[index % order.length];
}

function scaleMix(mix: CompanyMix, slots: number): RoleKey[] {
  if (slots <= 0) return [];
  const weighted = MIX_KEYS.map((key) => ({ key, count: Math.max(0, mix[key] || 0) }));
  const total = weighted.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    const fallback: RoleKey[] = ['fullstack', 'frontend', 'backend', 'qa', 'junior'];
    return Array.from({ length: slots }, (_, i) => fallback[i % fallback.length]);
  }
  const portions = weighted.map((row) => {
    const exact = (row.count / total) * slots;
    return { ...row, take: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let used = portions.reduce((sum, row) => sum + row.take, 0);
  const byRemainder = [...portions].sort((a, b) => b.fraction - a.fraction);
  for (const row of byRemainder) {
    if (used >= slots) break;
    row.take += 1;
    used += 1;
  }
  const out: RoleKey[] = [];
  const counters: Record<string, number> = {};
  for (const row of portions) {
    for (let i = 0; i < row.take; i++) {
      if (row.key === 'security') {
        const seen = counters.security ?? 0;
        counters.security = seen + 1;
        out.push(expandSecurity(seen));
      } else {
        out.push(row.key);
      }
    }
  }
  return out.slice(0, slots);
}

function instructionsFor(seat: Seat, flowNames: string[]): string {
  return composeInstructions(seat.roleKey, flowNames);
}

function layerFor(flow: FlowRef): 'frontend' | 'backend' | 'fullstack' {
  const key = `${flow.flowKey} ${flow.name} ${flow.kind}`.toLowerCase();
  if (flow.kind === 'ui' || /signup|login|home|sign-up|sign-in/.test(key)) return 'frontend';
  if (flow.kind === 'api' || flow.kind === 'data' || /api|auth/.test(key)) return 'backend';
  return 'fullstack';
}

export function assignFlowRows(agents: GeneratedAgent[], flows: FlowRef[]): { owners: Map<string, { owner: string; backup: string | null }>; assignments: FlowAssignment[] } {
  const owners = new Map<string, { owner: string; backup: string | null }>();
  const assignments: FlowAssignment[] = [];
  const byRole = (role: RoleKey) => agents.filter((agent) => agent.roleKey === role);
  const first = (...roles: RoleKey[]) => {
    for (const role of roles) {
      const found = byRole(role)[0];
      if (found) return found;
    }
    return agents[0];
  };
  for (const flow of flows) {
    const key = `${flow.flowKey} ${flow.name} ${flow.kind}`.toLowerCase();
    const ui = flow.kind === 'ui' || /signup|login|home|sign-up|sign-in/.test(key);
    const api = flow.kind === 'api' || /api|auth/.test(key);
    const owner = ui ? first('frontend', 'fullstack', 'cto', 'ceo') : api || flow.kind === 'data' ? first('backend', 'fullstack', 'cto', 'ceo') : first('fullstack', 'cto', 'ceo');
    const backup = owner.roleKey === 'frontend'
      ? first('backend', 'fullstack', 'cto')
      : owner.roleKey === 'backend'
        ? first('frontend', 'fullstack', 'cto')
        : first('cto', 'ceo');
    const backupAgent = backup.tempId === owner.tempId ? agents.find((agent) => agent.tempId !== owner.tempId) ?? null : backup;
    owner.ownedFlowIds.push(flow.id);
    const layer = layerFor(flow);
    owners.set(flow.id, { owner: owner.tempId, backup: backupAgent?.tempId ?? null });
    assignments.push({ flowId: flow.id, layer, role: 'owner', agentTempId: owner.tempId });
    if (backupAgent) assignments.push({ flowId: flow.id, layer, role: 'backup', agentTempId: backupAgent.tempId });
  }
  return { owners, assignments };
}

/** M3 D13: always seeded; OFF when seats are full. */
const ALWAYS_PRESENT: RoleKey[] = [
  'ui_ux_designer',
  'documentation',
  'pr_coordinator',
  'research',
  'coach',
  'red_team',
  'blue_team',
];

export function generateCompany(input: GenerateCompanyInput): {
  agents: GeneratedAgent[];
  flowOwners: Map<string, { owner: string; backup: string | null }>;
  flowAssignments: FlowAssignment[];
} {
  if (!Number.isInteger(input.size) || input.size < 3 || input.size > 40) {
    throw new Error('Company size must be an integer from 3 to 40');
  }
  const leaders = leadershipFor(input.size);
  const specialists = scaleMix(input.mix, input.size - leaders.length);
  const seated = [...leaders, ...specialists];
  const overflow = ALWAYS_PRESENT.filter((role) => !seated.includes(role));
  const roleCounts = new Map<RoleKey, number>();
  const seats = [...seated, ...overflow].map((roleKey) => {
    const index = roleCounts.get(roleKey) ?? 0;
    roleCounts.set(roleKey, index + 1);
    return seatFor(roleKey, index);
  });
  const enabledByIndex = [...seated.map(() => true), ...overflow.map(() => false)];

  // QA reports to the scrum master when one exists, otherwise the CTO or CEO.
  const present = new Set(seats.map((seat) => seat.roleKey));
  for (const seat of seats) {
    if (seat.managerRole && !present.has(seat.managerRole)) {
      seat.managerRole = present.has('cto') ? 'cto' : 'ceo';
    }
  }

  const names = shuffle(NAMES, input.seed);
  const agents: GeneratedAgent[] = seats.map((seat, index) => {
    const sameRoleIndex = seats.slice(0, index).filter((item) => item.roleKey === seat.roleKey).length;
    const slug = sameRoleIndex === 0 ? seat.roleKey : `${seat.roleKey}-${sameRoleIndex + 1}`;
    return {
      tempId: `tmp-${index + 1}`,
      slug,
      realName: names[index % names.length],
      roleKey: seat.roleKey,
      roleTitle: seat.roleTitle.trim(),
      department: seat.department,
      hierarchyLevel: seat.hierarchyLevel,
      managerTempId: null,
      backupTempId: null,
      instructions: '',
      description: `${seat.roleTitle.trim()} for this repository.`,
      skills: seat.skills,
      ownedFlowIds: [],
      enabled: enabledByIndex[index] !== false,
    };
  });

  const tempByRole = new Map<RoleKey, string>();
  seats.forEach((seat, index) => {
    if (!tempByRole.has(seat.roleKey)) tempByRole.set(seat.roleKey, agents[index].tempId);
  });
  seats.forEach((seat, index) => {
    agents[index].managerTempId = seat.managerRole ? tempByRole.get(seat.managerRole) ?? null : null;
  });

  for (let i = 0; i < agents.length; i++) {
    const same = agents.find((agent, j) => j !== i && agent.roleKey === agents[i].roleKey);
    const manager = agents.find((agent) => agent.tempId === agents[i].managerTempId);
    const fallback = agents.find((agent) => agent.tempId !== agents[i].tempId);
    agents[i].backupTempId = same?.tempId ?? manager?.tempId ?? fallback?.tempId ?? null;
  }

  const assigned = assignFlowRows(agents, input.flows ?? []);
  const flowOwners = assigned.owners;
  for (const agent of agents) {
    const owned = (input.flows ?? []).filter((flow) => agent.ownedFlowIds.includes(flow.id)).map((flow) => flow.name);
    const seat = seats[agents.indexOf(agent)];
    agent.instructions = instructionsFor(seat, owned);
  }

  return { agents, flowOwners, flowAssignments: assigned.assignments };
}
