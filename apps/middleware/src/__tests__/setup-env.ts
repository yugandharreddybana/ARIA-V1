import { generateKeyPairSync } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.VITEST = '1';
process.env.DATABASE_URL ??= 'postgresql://aria:aria@127.0.0.1:5432/aria_dev';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.COOKIE_SECRET ??= 'test-cookie-secret-must-be-32-characters-min';
process.env.WORKSPACE_ENCRYPTION_KEY ??= 'test-workspace-encryption-key-32b';
process.env.GITHUB_CLIENT_ID ??= '';
process.env.GITHUB_CLIENT_SECRET ??= '';
process.env.ARIA_LLM_MODE ??= 'mock';
process.env.ARIA_GITHUB_MODE ??= 'mock';
process.env.OLLAMA_BASE_URL ??= 'http://127.0.0.1:11434';
process.env.BACKEND_URL ??= 'http://127.0.0.1:8080';

if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const publicPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  process.env.JWT_PRIVATE_KEY = Buffer.from(privatePem).toString('base64');
  process.env.JWT_PUBLIC_KEY = Buffer.from(publicPem).toString('base64');
}
