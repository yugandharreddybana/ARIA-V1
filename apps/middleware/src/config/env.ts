import { z } from 'zod';

/** Zod's boolean coerce treats the string "false" as true. */
function envFlag(fallback: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(text)) return true;
    if (['0', 'false', 'no', 'off'].includes(text)) return false;
    return value;
  }, z.boolean());
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Postgres + Redis
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // JWT (RS256)
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Middleware
  COOKIE_SECRET: z.string().min(32),
  MIDDLEWARE_PORT: z.coerce.number().default(3001),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),

  // Backend
  BACKEND_URL: z.string().url().default('http://localhost:8080'),

  // Ollama
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: z.string().default('qwen2.5-coder:7b'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),

  // Anthropic — gated by ANTHROPIC_ENABLED
  ANTHROPIC_ENABLED: z.coerce.boolean().default(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_HIGH_STAKES_MODEL: z.string().default('claude-opus-4-7'),

  // Token Gateway (V27.9 §18H)
  MAX_SESSION_TOKEN_BUDGET: z.coerce.number().int().positive().default(500_000),
  TOKEN_BUDGET_WARN_RATIO:  z.coerce.number().min(0).max(1).default(0.80),
  TOKEN_BUDGET_HARD_RATIO:  z.coerce.number().min(0).max(1).default(0.95),
  MAX_QUEUE_DEPTH:          z.coerce.number().int().positive().default(50),

  // Secrets at rest (scrypt + AES-256-GCM). Required before any token is stored.
  WORKSPACE_ENCRYPTION_KEY: z.string().min(16),
  WORKSPACE_ENCRYPTION_KEY_ID: z.string().regex(/^[\w.-]{1,32}$/).default('k1'),

  // GitHub OAuth is optional. Local signup works without it; repo access uses a PAT.
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_CALLBACK_URL: z.string().url().default('http://localhost:3001/api/auth/github/callback'),
  GITHUB_API_BASE: z.string().url().default('https://api.github.com'),

  // LLM provider defaults. mock skips network in tests and local dry-runs.
  ARIA_LLM_MODE: z.enum(['live', 'mock']).default('live'),
  ARIA_GITHUB_MODE: z.enum(['live', 'mock']).default('live'),
  CURSOR_API_BASE: z.string().url().default('https://api.cursor.com'),

  // Service-to-service auth. Blank in dev bypasses internal hops that check it.
  ARIA_INTERNAL_SERVICE_TOKEN: z.string().optional(),

  // Milestone 2 — agent runs. Owner questions in M2_PLAN §16 are settings.
  ARIA_DATA_DIR: z.string().optional(),
  ARIA_CURSOR_LOCAL_MODE: z.enum(['live', 'stub']).default('live'),
  RUN_WORKER_ENABLED: envFlag(true),
  RUN_CONCURRENCY_CURSOR_LOCAL: z.coerce.number().int().positive().default(1),
  RUN_CONCURRENCY_CURSOR_CLOUD: z.coerce.number().int().positive().default(3),
  RUN_CONCURRENCY_LOCAL_WORKTREE: z.coerce.number().int().positive().default(1),
  RUN_CONCURRENCY_CHAT: z.coerce.number().int().positive().default(2),
  ARIA_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().default(20_000_000),
  /** user: PRs authored by the owner. service_account: PRs authored by the Cursor app. */
  ARIA_CURSOR_KEY_TYPE: z.enum(['user', 'service_account']).default('user'),
  /** block: do not launch coding on an unprotected default branch. warn: launch and record it. */
  ARIA_MERGE_GUARD_MODE: z.enum(['block', 'warn']).default('block'),
  /** Local worktree fallback is off until the owner opts in. */
  ARIA_LOCAL_FALLBACK: z.enum(['off', 'on']).default('off'),
  /** awaiting_merge does not count as an agent's one active task unless this is true. */
  ARIA_AWAITING_MERGE_COUNTS_ACTIVE: envFlag(false),
  /** ARIA-side Playwright capture. The coding/QA prompts always require before/after shots. */
  ARIA_QA_BROWSER: envFlag(false),
  /** Full LLM security-review stage. Off until M3. Secret and path guards still run. */
  ARIA_SECURITY_REVIEW: envFlag(false),
  ARIA_MAX_REVIEW_FIX_ROUNDS: z.coerce.number().int().min(0).max(10).default(2),
  ARIA_MAX_QA_FIX_ROUNDS: z.coerce.number().int().min(0).max(10).default(2),
  ARIA_WORKDAYS: z.string().default('1,2,3,4,5'),
  ARIA_TIMEZONE: z.string().default('UTC'),
  ARIA_WORKDAY_START: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  ARIA_WORKDAY_END: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
  ARIA_SCHEDULE_RISK_RATIO: z.coerce.number().min(0).max(1).default(0.8),
  ARIA_PUBLIC_URL: z.string().url().default('http://127.0.0.1:3001'),
})
.superRefine((env, ctx) => {
  if (env.ANTHROPIC_ENABLED && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: 'ANTHROPIC_API_KEY is required when ANTHROPIC_ENABLED=true',
    });
  }
  if (env.WORKSPACE_ENCRYPTION_KEY.includes('change-this') || env.WORKSPACE_ENCRYPTION_KEY === 'changeme') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WORKSPACE_ENCRYPTION_KEY'],
      message: 'WORKSPACE_ENCRYPTION_KEY is still the example placeholder',
    });
  }
  if (env.TOKEN_BUDGET_WARN_RATIO >= env.TOKEN_BUDGET_HARD_RATIO) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TOKEN_BUDGET_WARN_RATIO'],
      message: 'TOKEN_BUDGET_WARN_RATIO must be less than TOKEN_BUDGET_HARD_RATIO',
    });
  }
  if (env.NODE_ENV === 'production' && env.ARIA_CURSOR_LOCAL_MODE === 'stub') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ARIA_CURSOR_LOCAL_MODE'],
      message: 'ARIA_CURSOR_LOCAL_MODE=stub is refused in production',
    });
  }
  if (env.ARIA_SCHEDULE_RISK_RATIO <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ARIA_SCHEDULE_RISK_RATIO'],
      message: 'ARIA_SCHEDULE_RISK_RATIO must be greater than 0',
    });
  }
});

export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.safeParse(source);
}

export type ValidatedEnv = z.infer<typeof envSchema>;
let _env: ValidatedEnv | null = null;

export function validateEnv(): ValidatedEnv {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid env:\n${lines.join('\n')}`);
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      throw new Error(`Invalid env:\n${lines.join('\n')}`);
    }
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function _resetEnvCacheForTests(): void {
  _env = null;
}
