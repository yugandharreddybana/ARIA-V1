export const RISK_CLASSES = ['A', 'B', 'C', 'D'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'review', 'done', 'blocked', 'cancelled'] as const;
export const TICKET_TYPES = ['feature', 'bug', 'tech_debt', 'security', 'devops'] as const;
export const SESSION_STATES = ['bootstrapping', 'planning', 'active', 'paused', 'review', 'retro', 'completed', 'failed'] as const;
export const SKILL_STATUSES = ['idle', 'active', 'thinking', 'blocked', 'offline'] as const;

export const RISK_CLASS_LABELS: Record<string, string> = {
  A: 'Low Risk — Auto-approve',
  B: 'Medium Risk — Team Lead reviews',
  C: 'High Risk — Human approval required',
  D: 'Critical — Human approval + secondary review',
};

export const DEFAULT_OLLAMA_MODEL = 'llama3';
export const DEFAULT_BRANCH = 'main';
export const JWT_ACCESS_EXPIRES_IN = '15m';
export const JWT_REFRESH_EXPIRES_IN = '7d';
