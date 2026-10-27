export interface HardRule {
  id: string;
  rule: string;
}

export interface BaseSkill {
  id: '_base';
  version: string;
  role: string;
  extends: null;
  hardRules: HardRule[];
  contextLoad: string[];
  neverLoad: string[];
  dont: string[];
}

export interface RoleSkill {
  roleKey: string;
  role: string;
  extends: '_base';
  modelTier: 'high' | 'low';
  maxOutputTokens: number;
  contextLoad: string[];
  inputs: string[];
  do: string[];
  dont: string[];
  outputSchema: Record<string, unknown>;
  doneWhen: string[];
}

export const HARD_RULE_IDS = [
  'wip_one',
  'user_approves_merge',
  'dev_qa_evidence',
  'ticket_events_hash',
  'ac_gherkin',
  'story_points_fib',
  'sprint_10',
  'code_ownership',
  'dep_gate',
  'ui_mock_gate',
  'api_contract',
  'idea_lifecycle',
  'red_blue_tickets',
  'context_load',
  'no_secrets',
] as const;

export type HardRuleId = (typeof HARD_RULE_IDS)[number];
