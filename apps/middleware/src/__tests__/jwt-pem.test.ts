import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pemFromEnv } from '../config/jwt';

describe('pemFromEnv', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();

  it('returns a PEM unchanged', () => {
    expect(pemFromEnv(pem)).toBe(pem);
  });

  it('decodes a base64 PEM from generate-keys.sh', () => {
    expect(pemFromEnv(Buffer.from(pem).toString('base64'))).toBe(pem);
  });

  it('unescapes literal newlines from dev-up.sh', () => {
    expect(pemFromEnv(pem.replace(/\n/g, '\\n'))).toBe(pem);
  });
});
