import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { _clearDerivedKeyCacheForTests, decryptSecret, encryptSecret } from '../services/crypto.service';

const ctx = { workspaceId: '11111111-1111-4111-8111-111111111111', column: 'llm_api_key_encrypted' };

describe('secret encryption', () => {
  it('round-trips a token bound to the workspace column', () => {
    const token = 'ghp_example_token_value';
    const stored = encryptSecret(token, ctx);
    expect(stored.startsWith('gcm:v2:')).toBe(true);
    expect(stored.includes(token)).toBe(false);
    expect(decryptSecret(stored, ctx)).toBe(token);
    expect(() => decryptSecret(stored)).toThrow(/workspace binding/);
    expect(() => decryptSecret(stored, { ...ctx, workspaceId: '22222222-2222-4222-8222-222222222222' })).toThrow();
  });

  it('rejects a ciphertext that was altered', () => {
    const stored = encryptSecret('aria-mock-github', ctx);
    const parts = stored.split(':');
    parts[4] = '00'.repeat(8);
    expect(() => decryptSecret(parts.join(':'), ctx)).toThrow();
  });

  it('still decrypts a scrypt v1 blob written before AAD', () => {
    const token = 'legacy-token-value';
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(process.env.WORKSPACE_ENCRYPTION_KEY!, salt, 32, { N: 16384, r: 8, p: 1 });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const stored = ['scrypt', 'v1', salt.toString('hex'), iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':');
    expect(decryptSecret(stored)).toBe(token);
  });

  it('rejects the example placeholder key', () => {
    const previous = process.env.WORKSPACE_ENCRYPTION_KEY;
    process.env.WORKSPACE_ENCRYPTION_KEY = 'change-this-to-a-random-string-of-at-least-32-chars';
    _clearDerivedKeyCacheForTests();
    try {
      expect(() => encryptSecret('secret', ctx)).toThrow(/placeholder/);
    } finally {
      process.env.WORKSPACE_ENCRYPTION_KEY = previous;
      _clearDerivedKeyCacheForTests();
    }
  });
});
