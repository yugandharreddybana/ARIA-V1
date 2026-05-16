import { z } from 'zod';

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
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
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

  // GitHub OAuth
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_CALLBACK_URL: z.string().url().default('http://localhost:3001/api/auth/github/callback'),
})
.superRefine((env, ctx) => {
  if (env.ANTHROPIC_ENABLED && !env.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: 'ANTHROPIC_API_KEY is required when ANTHROPIC_ENABLED=true',
    });
  }
  if (env.TOKEN_BUDGET_WARN_RATIO >= env.TOKEN_BUDGET_HARD_RATIO) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TOKEN_BUDGET_WARN_RATIO'],
      message: 'TOKEN_BUDGET_WARN_RATIO must be less than TOKEN_BUDGET_HARD_RATIO',
    });
  }
});

export type ValidatedEnv = z.infer<typeof envSchema>;
let _env: ValidatedEnv | null = null;

export function validateEnv(): ValidatedEnv {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid env:');
    result.error.issues.forEach(i => console.error(`  ${i.path.join('.')}: ${i.message}`));
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function _resetEnvCacheForTests(): void {
  _env = null;
}
