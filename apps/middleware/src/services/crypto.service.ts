import crypto from 'node:crypto';
import { AppError } from '../middleware/error.middleware';

const SCRYPT_PREFIX = 'scrypt:v1';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function passphrase(): string {
  const raw = process.env.WORKSPACE_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new AppError('WORKSPACE_ENCRYPTION_KEY is missing or shorter than 16 characters', 500, 'CONFIG_ERROR');
  }
  return raw;
}

export function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(secret, salt, 32, SCRYPT_PARAMS);
}

/** AES-256-GCM with a random salt and scrypt-derived key. */
export function encryptSecret(plain: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(passphrase(), salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SCRYPT_PREFIX, salt.toString('hex'), iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':');
}

function decryptScrypt(stored: string): string {
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

export function decryptSecret(stored: string): string {
  if (stored.startsWith(`${SCRYPT_PREFIX}:`)) return decryptScrypt(stored);
  return decryptLegacy(stored);
}
