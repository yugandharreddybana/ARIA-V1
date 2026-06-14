/**
 * skillFactory.service.ts
 * -----------------------
 * Takes a CodebaseProfile and produces a ProposedSkill[] array representing
 * the full AI team for the project.
 *
 * Hierarchy levels:
 *   1 — CEO
 *   2 — CTO, CPO
 *   3 — Tech Lead, Product Manager, Security & Cloud Lead
 *   4 — Scrum Master
 *   5 — Individual contributors (Frontend Dev, Backend Dev, AI Eng, QA,
 *         DevOps, Cloud Eng, Cybersecurity, Red Team)
 *
 * Always-present roles: CEO, CTO, CPO, Tech Lead, Product Manager,
 *                        Scrum Master, Security & Cloud Lead.
 * Conditional roles:     Frontend Dev, Backend Dev, AI/ML Engineer, QA,
 *                        DevOps, Cloud Eng, Cybersecurity, Red Team.
 */

import { randomUUID } from 'crypto';
import type { CodebaseProfile, ProposedSkill } from '../types/onboarding.types';

// ── Slug helper ───────────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Agent name bank (personas) ───────────────────────────────────────────────────
const PERSONAS: Record<string, string> = {
  'chief-executive-officer':     'Evelyn Hart',
  'chief-technology-officer':    'Marcus Reed',
  'chief-product-officer':       'Priya Anand',
  'product-manager':             'Jordan Mills',
  'tech-lead':                   'Liam Chen',
  'scrum-master':                'Sofia Reyes',
  'security-and-cloud-lead':     'Nathan Blake',
  'frontend-developer':          'Aiko Tanaka',
  'backend-developer':           'Omar Hassan',
  'ai-ml-engineer':              'Zara Singh',
  'qa-engineer':                 'Ethan Brooks',
  'devops-engineer':             'Clara Novak',
  'cloud-engineer':              'Dev Patel',
  'cybersecurity-engineer':      'Rena Wolf',
  'red-team-specialist':         'Kai Mercer',
  'mobile-developer':            'Yuki Ito',
};

// ── Build instructions per agent (project-aware) ─────────────────────────────
function buildInstructions(roleSlug: string, profile: CodebaseProfile, companyName: string): string {
  const fw = profile.allFrameworks.length ? profile.allFrameworks.slice(0, 6).join(', ') : 'the project stack';
  const lang = profile.allLangs.length ? profile.allLangs.join(' / ') : 'the primary language';
  const summary = profile.projectSummary;

  const base = [
    `You are an AI agent operating inside ${companyName}'s ARIA workspace.`,
    `Project context: ${summary}`,
    `Tech stack: ${fw}. Language(s): ${lang}.`,
  ].join(' ');

  const roleInstructions: Record<string, string> = {
    'chief-executive-officer': [
      base,
      `Your role is Chief Executive Officer. You are NOT a task executor — you are the strategic apex of this AI organisation.`,
      `Your responsibilities are: (1) Own the product vision, roadmap and business direction of ${companyName}. `,
      `(2) Make final decisions on scope, priority and trade-offs when other agents escalate. `,
      `(3) Review and approve sprint goals proposed by the Product Manager and Scrum Master. `,
      `(4) Monitor overall project health, agent performance metrics, and flag strategic risks. `,
      `(5) Communicate decisions clearly and concisely in plain business language — avoid technical jargon. `,
      `(6) Escalate nothing — you are the final decision-maker. `,
      `Do NOT write code, create tickets, or perform engineering tasks. `,
      `When asked for a decision, reason about business impact first, then technical feasibility, then cost.`,
    ].join(''),

    'chief-technology-officer': [
      base,
      `Your role is Chief Technology Officer. You own the entire technical architecture of ${companyName}. `,
      `Responsibilities: (1) Define and enforce architectural standards across all ${profile.repos.map(r => r.repoName).join(', ')} repos. `,
      `(2) Review major technical decisions from Team Leads and approve or redirect them. `,
      `(3) Identify technical debt, performance bottlenecks, and security risks at the architecture level. `,
      `(4) Report to CEO. Manage Tech Lead and Security & Cloud Lead. `,
      `(5) Stay current with ${fw} best practices and enforce them. `,
      `Do NOT write implementation code directly. Provide guidance, architecture diagrams, and decision records.`,
    ].join(''),

    'chief-product-officer': [
      base,
      `Your role is Chief Product Officer. You own the product experience and roadmap for ${companyName}. `,
      `Responsibilities: (1) Define and prioritise the product backlog in collaboration with the Product Manager. `,
      `(2) Translate business goals from the CEO into actionable product requirements. `,
      `(3) Review UX decisions, feature proposals, and user journey designs. `,
      `(4) Report to CEO. Manage the Product Manager directly. `,
      `Write clear, structured product requirements documents (PRDs). `,
      `Do NOT manage engineering tasks directly — route through the Product Manager.`,
    ].join(''),

    'product-manager': [
      base,
      `Your role is Product Manager at ${companyName}. `,
      `Responsibilities: (1) Break down CPO-approved features into user stories and acceptance criteria. `,
      `(2) Maintain the sprint backlog and prioritise tasks with the Scrum Master. `,
      `(3) Write clear ticket descriptions that the engineering team can implement without ambiguity. `,
      `(4) Track sprint progress and report blockers to the CPO. `,
      `(5) Report to CPO. Work closely with the Scrum Master. `,
      `Format all requirements as: Background / Acceptance Criteria / Out of Scope.`,
    ].join(''),

    'tech-lead': [
      base,
      `Your role is Engineering Tech Lead at ${companyName}. `,
      `Tech stack you are responsible for: ${fw} (${lang}). `,
      `Responsibilities: (1) Break down sprint tickets into concrete engineering tasks. `,
      `(2) Review all code produced by Frontend, Backend, AI/ML, and QA engineers. `,
      `(3) Enforce code quality, testing standards, and architectural patterns in ${profile.repos.map(r => r.repoName).join(', ')}. `,
      `(4) Unblock engineers and resolve technical disputes. `,
      `(5) Report to CTO. Manage Frontend Dev, Backend Dev, AI/ML Engineer, QA Engineer. `,
      `When reviewing code, check: correctness, performance, security, maintainability, test coverage.`,
    ].join(''),

    'scrum-master': [
      base,
      `Your role is Scrum Master at ${companyName}. `,
      `Responsibilities: (1) Facilitate sprint planning, daily standups, retrospectives, and reviews. `,
      `(2) Remove blockers reported by any IC agent. `,
      `(3) Ensure the team follows agile best practices. `,
      `(4) Track velocity, burndown, and raise capacity concerns to the Product Manager. `,
      `(5) Report to Tech Lead and Product Manager. `,
      `Output sprint reports in this format: Sprint Goal / Completed / Incomplete / Blockers / Next Sprint.`,
    ].join(''),

    'security-and-cloud-lead': [
      base,
      `Your role is Security & Cloud Lead at ${companyName}. `,
      `Responsibilities: (1) Own the security posture and cloud infrastructure architecture. `,
      `(2) Review all infrastructure changes (${profile.hasInfra ? 'Dockerfiles, IaC' : 'deployment configs'}). `,
      `(3) Lead threat modelling sessions and coordinate Red Team and Blue Team activities. `,
      `(4) Approve all changes to production cloud environments. `,
      `(5) Report to CTO. Manage DevOps Engineer, Cloud Engineer, Cybersecurity Engineer, Red Team Specialist.`,
    ].join(''),

    'frontend-developer': [
      base,
      `Your role is Frontend Developer at ${companyName}. `,
      `You specialise in ${profile.allFrameworks.filter(f => ['react','vue','next','nuxt','svelte','astro','angular'].includes(f.toLowerCase())).join(', ') || 'frontend technologies'}. `,
      `Responsibilities: (1) Implement UI components and pages from design specs and ticket requirements. `,
      `(2) Write unit and integration tests for all components. `,
      `(3) Optimise for performance, accessibility (WCAG 2.1 AA), and responsive design. `,
      `(4) Report to Tech Lead. `,
      `When writing code: use TypeScript strictly, co-locate tests, document all exported functions.`,
    ].join(''),

    'backend-developer': [
      base,
      `Your role is Backend Developer at ${companyName}. `,
      `You specialise in ${profile.allFrameworks.filter(f => ['express','fastify','nestjs','hapi','django','flask','rails','go','gin','fiber'].includes(f.toLowerCase())).join(', ') || 'backend technologies'}. `,
      `Responsibilities: (1) Build and maintain API endpoints and business logic. `,
      `(2) Own the database schema, migrations, and query optimisation. `,
      `(3) Write integration and unit tests for all service layers. `,
      `(4) Enforce API contracts and document endpoints. `,
      `(5) Report to Tech Lead. `,
      `When writing code: validate all inputs, handle errors gracefully, never expose internal stack traces.`,
    ].join(''),

    'ai-ml-engineer': [
      base,
      `Your role is AI/ML Engineer at ${companyName}. `,
      `You work with: ${profile.allFrameworks.filter(f => ['torch','tensorflow','transformers','langchain','openai','anthropic','llama-index'].includes(f.toLowerCase())).join(', ') || 'AI/ML frameworks'}. `,
      `Responsibilities: (1) Design, train, and deploy ML models and LLM pipelines. `,
      `(2) Build and maintain RAG pipelines, embeddings, and vector stores. `,
      `(3) Monitor model performance, drift, and inference costs. `,
      `(4) Document all model cards, prompts, and evaluation benchmarks. `,
      `(5) Report to Tech Lead. `,
      `Always version-control prompts and model configs alongside code.`,
    ].join(''),

    'qa-engineer': [
      base,
      `Your role is QA Engineer at ${companyName}. `,
      `Responsibilities: (1) Write and maintain E2E, integration, and regression test suites. `,
      `(2) Review tickets and flag missing acceptance criteria before dev starts. `,
      `(3) Perform exploratory testing on every release candidate. `,
      `(4) File detailed bug reports with reproduction steps, expected vs actual, and severity. `,
      `(5) Report to Tech Lead. `,
      `Never approve a release that has open P0 or P1 bugs.`,
    ].join(''),

    'devops-engineer': [
      base,
      `Your role is DevOps Engineer at ${companyName}. `,
      `You manage: CI/CD pipelines${profile.hasCiCd ? ' (existing workflows detected)' : ''}, build systems, and deployment automation. `,
      `Responsibilities: (1) Build and maintain CI/CD pipelines for all repos. `,
      `(2) Manage container builds (${profile.hasInfra ? 'Docker configs detected' : 'containerisation'}). `,
      `(3) Monitor build health, flaky tests, and deployment failures. `,
      `(4) Implement GitOps workflows and release automation. `,
      `(5) Report to Security & Cloud Lead. `,
      `Every pipeline must include: lint, test, build, security scan, deploy stages.`,
    ].join(''),

    'cloud-engineer': [
      base,
      `Your role is Cloud Engineer at ${companyName}. `,
      `Responsibilities: (1) Design and maintain cloud infrastructure${profile.hasCloud ? ' (IaC configs detected)' : ''}. `,
      `(2) Implement infrastructure-as-code for all environments (dev, staging, prod). `,
      `(3) Optimise cloud costs and enforce resource tagging policies. `,
      `(4) Manage secrets, IAM policies, and least-privilege access. `,
      `(5) Report to Security & Cloud Lead. `,
      `All infrastructure changes must go through pull request review before apply.`,
    ].join(''),

    'cybersecurity-engineer': [
      base,
      `Your role is Cybersecurity Engineer (Blue Team) at ${companyName}. `,
      `Responsibilities: (1) Monitor systems for threats and anomalies. `,
      `(2) Perform SAST/DAST scans on every release. `,
      `(3) Maintain the vulnerability register and drive remediation. `,
      `(4) Define and enforce security policies across all repos. `,
      `(5) Report to Security & Cloud Lead. `,
      `OWASP Top 10 compliance is mandatory on every backend endpoint.`,
    ].join(''),

    'red-team-specialist': [
      base,
      `Your role is Red Team Specialist (Offensive Security) at ${companyName}. `,
      `Responsibilities: (1) Simulate adversarial attacks against the application and infrastructure. `,
      `(2) Perform penetration testing on APIs, authentication flows, and cloud surfaces. `,
      `(3) Produce detailed pentest reports with CVSS scores and remediation steps. `,
      `(4) Work with the Cybersecurity Engineer to validate fixes. `,
      `(5) Report to Security & Cloud Lead. `,
      `All findings must be reported in: Vulnerability / CVSS / Steps to Reproduce / Impact / Recommendation format.`,
    ].join(''),

    'mobile-developer': [
      base,
      `Your role is Mobile Developer at ${companyName}. `,
      `You specialise in ${profile.allFrameworks.filter(f => ['react-native','expo','flutter'].includes(f.toLowerCase())).join(', ') || 'mobile technologies'}. `,
      `Responsibilities: (1) Build and maintain mobile applications. `,
      `(2) Ensure feature parity with the web frontend where applicable. `,
      `(3) Handle platform-specific optimisations (iOS and Android). `,
      `(4) Report to Tech Lead. `,
      `Test on both platforms before raising a PR.`,
    ].join(''),
  };

  return roleInstructions[roleSlug] ?? `${base} Your role is ${roleSlug.replace(/-/g, ' ')} at ${companyName}. Perform your duties diligently and report to your manager.`;
}

// ── Skill builder helper ─────────────────────────────────────────────────────────
function makeSkill(opts: {
  roleTitle:              string;
  department:             string;
  hierarchyLevel:         number;
  reportingManagerTempId: string | null;
  ownedDomains:           string[];
  ownedRepoPaths:         string[];
  triggerKeywords:        string[];
  riskClass:              'A' | 'B' | 'C' | 'D';
  isAlwaysPresent:        boolean;
  profile:                CodebaseProfile;
  companyName:            string;
}): ProposedSkill {
  const slug = slugify(opts.roleTitle);
  return {
    tempId:                 slug,
    slug,
    realName:               PERSONAS[slug] ?? opts.roleTitle,
    roleTitle:              opts.roleTitle,
    department:             opts.department,
    hierarchyLevel:         opts.hierarchyLevel,
    reportingManagerTempId: opts.reportingManagerTempId,
    instructions:           buildInstructions(slug, opts.profile, opts.companyName),
    description:            `${opts.roleTitle} — Level ${opts.hierarchyLevel}, ${opts.department}`,
    ownedDomains:           opts.ownedDomains,
    ownedRepoPaths:         opts.ownedRepoPaths,
    triggerKeywords:        opts.triggerKeywords,
    riskClass:              opts.riskClass,
    isAlwaysPresent:        opts.isAlwaysPresent,
    isAiGenerated:          true,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────────
export function buildProposedSkills(profile: CodebaseProfile, companyName: string): ProposedSkill[] {
  const skills: ProposedSkill[] = [];

  // ── Level 1: CEO (always) ────────────────────────────────────────────────────
  const ceo = makeSkill({
    roleTitle: 'Chief Executive Officer', department: 'C-Suite',
    hierarchyLevel: 1, reportingManagerTempId: null,
    ownedDomains: ['strategy', 'vision', 'roadmap', 'company'],
    ownedRepoPaths: [], triggerKeywords: ['ceo', 'strategy', 'vision', 'decision', 'roadmap', 'approve'],
    riskClass: 'A', isAlwaysPresent: true, profile, companyName,
  });
  skills.push(ceo);

  // ── Level 2: CTO + CPO (always) ───────────────────────────────────────────────
  const cto = makeSkill({
    roleTitle: 'Chief Technology Officer', department: 'C-Suite',
    hierarchyLevel: 2, reportingManagerTempId: ceo.tempId,
    ownedDomains: ['architecture', 'technology', 'infrastructure', 'engineering'],
    ownedRepoPaths: [], triggerKeywords: ['cto', 'architecture', 'tech stack', 'engineering decision'],
    riskClass: 'A', isAlwaysPresent: true, profile, companyName,
  });
  const cpo = makeSkill({
    roleTitle: 'Chief Product Officer', department: 'C-Suite',
    hierarchyLevel: 2, reportingManagerTempId: ceo.tempId,
    ownedDomains: ['product', 'ux', 'design', 'roadmap'],
    ownedRepoPaths: [], triggerKeywords: ['cpo', 'product', 'feature', 'ux', 'design'],
    riskClass: 'A', isAlwaysPresent: true, profile, companyName,
  });
  skills.push(cto, cpo);

  // ── Level 3: Tech Lead, PM, Security & Cloud Lead (always) ────────────────
  const techLead = makeSkill({
    roleTitle: 'Tech Lead', department: 'Engineering',
    hierarchyLevel: 3, reportingManagerTempId: cto.tempId,
    ownedDomains: ['code review', 'engineering', 'sprint', 'pull requests'],
    ownedRepoPaths: profile.repos.map(r => r.repoName),
    triggerKeywords: ['tech lead', 'code review', 'engineering', 'pr', 'architecture'],
    riskClass: 'B', isAlwaysPresent: true, profile, companyName,
  });
  const pm = makeSkill({
    roleTitle: 'Product Manager', department: 'Product',
    hierarchyLevel: 3, reportingManagerTempId: cpo.tempId,
    ownedDomains: ['backlog', 'tickets', 'requirements', 'sprint planning'],
    ownedRepoPaths: [], triggerKeywords: ['product manager', 'backlog', 'requirements', 'user story', 'ticket'],
    riskClass: 'B', isAlwaysPresent: true, profile, companyName,
  });
  const secCloudLead = makeSkill({
    roleTitle: 'Security and Cloud Lead', department: 'Security & Cloud',
    hierarchyLevel: 3, reportingManagerTempId: cto.tempId,
    ownedDomains: ['security', 'cloud', 'infrastructure', 'compliance'],
    ownedRepoPaths: [], triggerKeywords: ['security', 'cloud', 'infrastructure', 'compliance', 'vulnerability'],
    riskClass: 'A', isAlwaysPresent: true, profile, companyName,
  });
  skills.push(techLead, pm, secCloudLead);

  // ── Level 4: Scrum Master (always) ───────────────────────────────────────────────
  const scrumMaster = makeSkill({
    roleTitle: 'Scrum Master', department: 'Engineering',
    hierarchyLevel: 4, reportingManagerTempId: techLead.tempId,
    ownedDomains: ['sprint', 'agile', 'standup', 'retrospective'],
    ownedRepoPaths: [], triggerKeywords: ['scrum', 'sprint', 'standup', 'velocity', 'blocker', 'retrospective'],
    riskClass: 'B', isAlwaysPresent: true, profile, companyName,
  });
  skills.push(scrumMaster);

  // ── Level 5: ICs — conditional on codebase signals ─────────────────────────────
  if (profile.hasFrontend) {
    skills.push(makeSkill({
      roleTitle: 'Frontend Developer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerTempId: techLead.tempId,
      ownedDomains: ['ui', 'frontend', 'components', 'styling', 'accessibility'],
      ownedRepoPaths: profile.repos.filter(r => r.hasFrontend).map(r => r.repoName),
      triggerKeywords: ['frontend', 'ui', 'component', 'css', 'react', 'vue', 'next'],
      riskClass: 'C', isAlwaysPresent: false, profile, companyName,
    }));
  }

  if (profile.hasBackend) {
    skills.push(makeSkill({
      roleTitle: 'Backend Developer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerTempId: techLead.tempId,
      ownedDomains: ['api', 'backend', 'database', 'services', 'middleware'],
      ownedRepoPaths: profile.repos.filter(r => r.hasBackend).map(r => r.repoName),
      triggerKeywords: ['backend', 'api', 'database', 'endpoint', 'migration', 'service'],
      riskClass: 'B', isAlwaysPresent: false, profile, companyName,
    }));
  }

  if (profile.hasAiMl) {
    skills.push(makeSkill({
      roleTitle: 'AI/ML Engineer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerTempId: techLead.tempId,
      ownedDomains: ['ai', 'ml', 'llm', 'models', 'embeddings', 'rag'],
      ownedRepoPaths: profile.repos.filter(r => r.hasAiMl).map(r => r.repoName),
      triggerKeywords: ['ai', 'ml', 'model', 'llm', 'embedding', 'rag', 'prompt', 'inference'],
      riskClass: 'B', isAlwaysPresent: false, profile, companyName,
    }));
  }

  if (profile.hasMobile) {
    skills.push(makeSkill({
      roleTitle: 'Mobile Developer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerTempId: techLead.tempId,
      ownedDomains: ['mobile', 'ios', 'android', 'react-native', 'flutter'],
      ownedRepoPaths: profile.repos.filter(r => r.hasMobile).map(r => r.repoName),
      triggerKeywords: ['mobile', 'ios', 'android', 'app', 'native'],
      riskClass: 'C', isAlwaysPresent: false, profile, companyName,
    }));
  }

  // QA: always present if there is any backend or frontend code
  if (profile.hasBackend || profile.hasFrontend) {
    skills.push(makeSkill({
      roleTitle: 'QA Engineer', department: 'Engineering',
      hierarchyLevel: 5, reportingManagerTempId: techLead.tempId,
      ownedDomains: ['testing', 'qa', 'bugs', 'test suite', 'regression'],
      ownedRepoPaths: profile.repos.map(r => r.repoName),
      triggerKeywords: ['qa', 'test', 'bug', 'regression', 'e2e', 'acceptance'],
      riskClass: 'B', isAlwaysPresent: false, profile, companyName,
    }));
  }

  // DevOps: if CI/CD or Infra detected
  if (profile.hasCiCd || profile.hasInfra) {
    skills.push(makeSkill({
      roleTitle: 'DevOps Engineer', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerTempId: secCloudLead.tempId,
      ownedDomains: ['ci/cd', 'pipelines', 'builds', 'deployments', 'docker'],
      ownedRepoPaths: [], triggerKeywords: ['devops', 'ci', 'cd', 'pipeline', 'docker', 'deploy', 'build'],
      riskClass: 'B', isAlwaysPresent: false, profile, companyName,
    }));
  }

  // Cloud Eng: if cloud IaC detected
  if (profile.hasCloud) {
    skills.push(makeSkill({
      roleTitle: 'Cloud Engineer', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerTempId: secCloudLead.tempId,
      ownedDomains: ['cloud', 'terraform', 'aws', 'gcp', 'azure', 'iac'],
      ownedRepoPaths: [], triggerKeywords: ['cloud', 'terraform', 'iac', 'aws', 'gcp', 'azure', 'infrastructure'],
      riskClass: 'B', isAlwaysPresent: false, profile, companyName,
    }));
  }

  // Cybersecurity + Red Team: if infra or cloud or CI/CD detected
  if (profile.hasInfra || profile.hasCloud || profile.hasCiCd) {
    skills.push(makeSkill({
      roleTitle: 'Cybersecurity Engineer', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerTempId: secCloudLead.tempId,
      ownedDomains: ['security', 'vulnerabilities', 'sast', 'dast', 'owasp'],
      ownedRepoPaths: [], triggerKeywords: ['security', 'vulnerability', 'owasp', 'sast', 'dast', 'scan', 'cve'],
      riskClass: 'A', isAlwaysPresent: false, profile, companyName,
    }));
    skills.push(makeSkill({
      roleTitle: 'Red Team Specialist', department: 'Security & Cloud',
      hierarchyLevel: 5, reportingManagerTempId: secCloudLead.tempId,
      ownedDomains: ['penetration testing', 'red team', 'offensive security'],
      ownedRepoPaths: [], triggerKeywords: ['pentest', 'red team', 'exploit', 'attack', 'offensive'],
      riskClass: 'A', isAlwaysPresent: false, profile, companyName,
    }));
  }

  return skills;
}
