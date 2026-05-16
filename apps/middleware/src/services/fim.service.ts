/**
 * File Integrity Monitor (V27.9 §12).
 * Hashes the "brain" files (SKILL.md, DESIGN.md, DOMAIN_BOUNDARIES.json, CORE_VALUES.yml)
 * and signs the registry with a per-daemon Ed25519 key. Any unsigned change to a tracked
 * file raises CONFIG_DRIFT_ALERT and locks the policy until a human reviews.
 *
 * Registry persists to .entiresystem/fim_registry.json — the path is committed so the team
 * can review the signed hashes via git.  The private signing key lives on disk at
 * .aria/keys/daemon.ed25519 (gitignored) and is generated on first run.
 */

import { createHash, generateKeyPairSync, sign, verify, type KeyObject, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface FimEntry {
  path: string;          // repo-relative
  hash: string;          // sha256(content)
  signature: string;     // base64 Ed25519 sig over `path:hash`
  signedBy: string;      // sha256 of the public key (audit fingerprint)
  signedAt: string;      // ISO timestamp
}

export interface FimRegistry {
  version: 1;
  entries: Record<string, FimEntry>;
}

export interface FimCheckResult {
  path: string;
  status: 'ok' | 'missing' | 'untracked' | 'modified' | 'invalid_signature';
  expectedHash?: string;
  observedHash?: string;
}

export interface FimDeps {
  repoRoot: string;
  registryPath?: string;       // default: <repoRoot>/.entiresystem/fim_registry.json
  privateKeyPath?: string;     // default: <repoRoot>/.aria/keys/daemon.ed25519
  publicKeyPath?: string;      // default: <repoRoot>/.entiresystem/keys/daemon.pub
}

const TRACKED_FILES = [
  '.entiresystem/CORE_VALUES.yml',
  '.entiresystem/DESIGN.md',
  '.entiresystem/DOMAIN_BOUNDARIES.json',
  '.entiresystem/SKILL.md',
];

export class FileIntegrityMonitor {
  private readonly repoRoot: string;
  private readonly registryPath: string;
  private readonly privateKeyPath: string;
  private readonly publicKeyPath: string;

  constructor(deps: FimDeps) {
    this.repoRoot = resolve(deps.repoRoot);
    this.registryPath  = deps.registryPath  ?? resolve(this.repoRoot, '.entiresystem/fim_registry.json');
    this.privateKeyPath = deps.privateKeyPath ?? resolve(this.repoRoot, '.aria/keys/daemon.ed25519');
    this.publicKeyPath  = deps.publicKeyPath  ?? resolve(this.repoRoot, '.entiresystem/keys/daemon.pub');
  }

  /** Returns the public key fingerprint (sha256 of DER) — used as `signed_by`. */
  ensureKeypair(): { privateKey: KeyObject; publicKey: KeyObject; fingerprint: string } {
    if (!existsSync(this.privateKeyPath)) {
      mkdirSync(dirname(this.privateKeyPath), { recursive: true });
      mkdirSync(dirname(this.publicKeyPath),  { recursive: true });
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      writeFileSync(this.privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
      writeFileSync(this.publicKeyPath,  publicKey.export({  type: 'spki',  format: 'pem' }) as string);
    }
    const privatePem = readFileSync(this.privateKeyPath, 'utf-8');
    const publicPem  = readFileSync(this.publicKeyPath,  'utf-8');
    const privateKey = createPrivateKey(privatePem);
    const publicKey  = createPublicKey(publicPem);
    const fingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' }) as Buffer);
    return { privateKey, publicKey, fingerprint };
  }

  /** Read the on-disk registry (or build an empty one). */
  loadRegistry(): FimRegistry {
    if (!existsSync(this.registryPath)) return { version: 1, entries: {} };
    try { return JSON.parse(readFileSync(this.registryPath, 'utf-8')) as FimRegistry; }
    catch { return { version: 1, entries: {} }; }
  }

  private saveRegistry(reg: FimRegistry): void {
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(reg, null, 2) + '\n');
  }

  /** Sign one tracked path and persist its entry. */
  signPath(repoRelPath: string): FimEntry {
    const abs = resolve(this.repoRoot, repoRelPath);
    if (!existsSync(abs)) throw new Error(`FIM: file not found: ${repoRelPath}`);
    const content = readFileSync(abs);
    const hash = sha256(content);
    const { privateKey, fingerprint } = this.ensureKeypair();
    const signature = sign(null, Buffer.from(`${repoRelPath}:${hash}`, 'utf-8'), privateKey).toString('base64');
    const entry: FimEntry = {
      path: repoRelPath, hash, signature, signedBy: fingerprint, signedAt: new Date().toISOString(),
    };
    const reg = this.loadRegistry();
    reg.entries[repoRelPath] = entry;
    this.saveRegistry(reg);
    return entry;
  }

  /** Sign all tracked files that currently exist. */
  signAllTracked(): FimEntry[] {
    return TRACKED_FILES.filter(p => existsSync(resolve(this.repoRoot, p))).map(p => this.signPath(p));
  }

  /** Check every tracked file. Untracked = file exists but never signed; missing = signed but gone. */
  checkAll(): FimCheckResult[] {
    const reg = this.loadRegistry();
    const { publicKey } = this.ensureKeypair();
    const results: FimCheckResult[] = [];
    for (const p of TRACKED_FILES) {
      const abs = resolve(this.repoRoot, p);
      const entry = reg.entries[p];
      if (!existsSync(abs)) {
        if (entry) results.push({ path: p, status: 'missing', expectedHash: entry.hash });
        continue;
      }
      const observed = sha256(readFileSync(abs));
      if (!entry) { results.push({ path: p, status: 'untracked', observedHash: observed }); continue; }
      if (observed !== entry.hash) {
        results.push({ path: p, status: 'modified', expectedHash: entry.hash, observedHash: observed });
        continue;
      }
      // Hash matches — verify signature for tamper detection on the registry itself.
      const ok = verify(null, Buffer.from(`${p}:${entry.hash}`, 'utf-8'),
                        publicKey, Buffer.from(entry.signature, 'base64'));
      results.push({ path: p, status: ok ? 'ok' : 'invalid_signature', expectedHash: entry.hash, observedHash: observed });
    }
    return results;
  }

  /** Convenience: any non-ok result counts as a drift event. */
  hasDrift(): boolean {
    return this.checkAll().some(r => r.status !== 'ok');
  }
}

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}
