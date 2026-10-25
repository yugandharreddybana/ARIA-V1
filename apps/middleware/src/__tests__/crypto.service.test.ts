import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../services/crypto.service';

describe('secret encryption', () => {
  it('round-trips a token and does not store the plaintext', () => {
    const token = 'ghp_example_token_value';
    const stored = encryptSecret(token);
    expect(stored.startsWith('scrypt:v1:')).toBe(true);
    expect(stored.includes(token)).toBe(false);
    expect(decryptSecret(stored)).toBe(token);
  });

  it('rejects a ciphertext that was altered', () => {
    const stored = encryptSecret('aria-mock-github');
    const parts = stored.split(':');
    parts[5] = '00'.repeat(8);
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
