// ARIA V1 — Shared Enums
// Single source of truth for all status/type values

export enum AnalysisStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum RiskClass {
  A = 'A',  // Read-only, safe
  B = 'B',  // Bounded code changes, auto-mergeable in graduated autonomy
  C = 'C',  // Non-critical API/schema changes, dual-agent approval
  D = 'D',  // Always human approval: auth, prod, destructive, IAM
}

export enum SkillStatus {
  ACTIVE = 'active',
  FUTURE = 'future',    // Visible in diagram but not fully implemented
  INACTIVE = 'inactive',
  QUARANTINED = 'quarantined',
}

export enum IdleMode {
  LEARNING = 'learning',
  CREATIVE = 'creative',
  REFLECTION = 'reflection',
  OFF = 'off',
}

export enum SessionState {
  NEW = 'new',
  BOOTSTRAPPING = 'bootstrapping',
  SCRUMMING = 'scrumming',
  WORKING = 'working',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum SessionMode {
  PRECISION = 'precision',
  THROUGHPUT = 'throughput',
  PLANNING = 'planning',
  SHADOW = 'shadow',
}

export enum Environment {
  DEV = 'dev',
  STAGING = 'staging',
  PROD_READONLY = 'prod_readonly',
  PRODUCTION = 'production',
}

export enum MissionType {
  STABILITY = 'stability',
  FEATURE = 'feature',
  TECH_DEBT = 'tech_debt',
  SECURITY = 'security',
  PLANNING = 'planning',
}

export enum TicketType {
  BUG = 'bug',
  FEATURE = 'feature',
  TECH_DEBT = 'tech_debt',
  INCIDENT = 'incident',
  PROCESS = 'process',
}

export enum TicketStatus {
  BACKLOG = 'backlog',
  READY_FOR_DEV = 'ready_for_dev',
  IN_PROGRESS = 'in_progress',
  READY_FOR_QA = 'ready_for_qa',
  IN_QA = 'in_qa',
  READY_FOR_REVIEW = 'ready_for_review',
  DONE = 'done',
  REJECTED = 'rejected',
}

export enum EvidenceType {
  BUG_REPORT = 'bug_report',
  FIX = 'fix',
  FEATURE_DESIGN = 'feature_design',
  QA_VERIFICATION = 'qa_verification',
}

export enum IdeaStatus {
  DRAFT = 'draft',
  READY_FOR_REVIEW = 'ready_for_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_DEVELOPMENT = 'in_development',
}
