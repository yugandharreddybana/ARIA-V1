import crypto from 'node:crypto';
import { AppError } from '../middleware/error.middleware';

const LEGACY_SCRYPT = 'scrypt:v1';
const CURRENT_PREFIX = 'gcm:v2';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const PLACEHOLDER_KEYS = new Set([
  'change-this-to-a-random-string-of-at-least-32-chars',
  'changeme',
  'change-me',
  'placeholder',
  'your-key-here',
]);

export interface SecretContext {
  workspaceId: string;
  column: string;
}

const derivedKeys = new Map<string, Buffer>();

function passphrase(): string {
  const raw = process.env.WORKSPACE_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new AppError('WORKSPACE_ENCRYPTION_KEY is missing or shorter than 16 characters', 500, 'CONFIG_ERROR');
  }
  if (PLACEHOLDER_KEYS.has(raw) || raw.includes('change-this')) {
    throw new AppError('WORKSPACE_ENCRYPTION_KEY is still the example placeholder', 500, 'CONFIG_ERROR');
  }
  return raw;
}

function keyId(): string {
  const id = (process.env.WORKSPACE_ENCRYPTION_KEY_ID || 'k1').trim();
  if (!/^[\w.-]{1,32}$/.test(id)) {
    throw new AppError('WORKSPACE_ENCRYPTION_KEY_ID must be 1-32 letters, numbers, dots, or dashes', 500, 'CONFIG_ERROR');
  }
  return id;
}

export function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(secret, salt, 32, SCRYPT_PARAMS);
}

/** One scrypt per key id per process. AES-GCM still uses a fresh IV per value. */
function cachedKey(id: string): Buffer {
  const hit = derivedKeys.get(id);
  if (hit) return hit;
  const key = deriveKey(passphrase(), Buffer.from(`aria-workspace-key:${id}`, 'utf8'));
  derivedKeys.set(id, key);
  return key;
}

function aadFor(ctx: SecretContext): Buffer {
  return Buffer.from(`${ctx.workspaceId}:${ctx.column}`, 'utf8');
}

/** AES-256-GCM bound to a workspace column. Ciphertext starts with gcm:v2. */
export function encryptSecret(plain: string, ctx: SecretContext): string {
  const id = keyId();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cachedKey(id), iv);
  cipher.setAAD(aadFor(ctx));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CURRENT_PREFIX, id, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':');
}

function decryptV2(stored: string, ctx: SecretContext): string {
  const match = stored.match(/^gcm:v2:([\w.-]{1,32}):([0-9a-f]+):([0-9a-f]+):([0-9a-f]+)$/i);
  if (!match) throw new AppError('Malformed encrypted secret', 500, 'DECRYPT_ERROR');
  const [, id, ivHex, tagHex, ctHex] = match;
  const decipher = crypto.createDecipheriv('aes-256-gcm', cachedKey(id), Buffer.from(ivHex, 'hex'));
  decipher.setAAD(aadFor(ctx));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}

function decryptScryptV1(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
    throw new AppError('Malformed encrypted secret', 500, 'DECRYPT_ERROR');
  }
  const salt = Buffer.from(parts[2], 'hex');
  const iv = Buffer.from(parts[3], 'hex');
  const tag = Buffer.from(parts[4], 'hex');
  const ciphertext = Buffer.from(parts[5], 'hex');
  const key = deriveKey(passphrase(), salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Legacy rows used the first 32 characters of the passphrase as the raw AES key. */
function decryptLegacy(stored: string): string {
  const raw = passphrase();
  if (raw.length < 32) {
    throw new AppError('Legacy secret cannot be decrypted with a short WORKSPACE_ENCRYPTION_KEY', 500, 'DECRYPT_ERROR');
  }
  const key = Buffer.from(raw.slice(0, 32), 'utf8');
  const parts = stored.split(':');
  if (parts.length !== 3) throw new AppError('Malformed encrypted secret', 500, 'DECRYPT_ERROR');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function decryptSecret(stored: string, ctx?: SecretContext): string {
  if (stored.startsWith('gcm:v2:')) {
    if (!ctx) throw new AppError('Encrypted secret is missing its workspace binding', 500, 'DECRYPT_ERROR');
    return decryptV2(stored, ctx);
  }
  if (stored.startsWith(`${LEGACY_SCRYPT}:`)) return decryptScryptV1(stored);
  return decryptLegacy(stored);
}

/** Test hook. Production never rotates the cache except by process restart. */
export function _clearDerivedKeyCacheForTests(): void {
  derivedKeys.clear();
}
