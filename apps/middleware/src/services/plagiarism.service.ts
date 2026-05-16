/**
 * IP / Plagiarism Scanner (V27.9 §13).
 * Scans a diff against:
 *   1. License markers in the snippet itself (GPL / AGPL / LGPL / MPL / SSPL fingerprints).
 *   2. SHA-256 + 5-gram fingerprints against a configurable internal corpus.
 *
 * Three outcomes per finding:
 *   - permissive  : MIT/BSD/Apache match → require attribution comment.
 *   - copyleft    : GPL/AGPL/LGPL/MPL/SSPL match → Legal Kill-Switch trigger.
 *   - unknown     : significant similarity to an unknown source → flag for legal review.
 */

import { createHash } from 'node:crypto';

export type LicenseClass = 'permissive' | 'copyleft' | 'unknown';

export interface CorpusEntry {
  source: string;           // human-readable origin
  license: LicenseClass;
  attribution?: string;
  fingerprints: string[];   // pre-computed 5-gram hashes
}

export interface PlagiarismFinding {
  matchedSource: string;
  license: LicenseClass;
  attribution?: string;
  similarity: number;        // 0..1 — overlap of n-gram fingerprints
  action: 'attribute' | 'legal_kill_switch' | 'flag_for_review';
}

const COPYLEFT_KEYWORDS = [
  /GNU\s+(GENERAL\s+PUBLIC|AFFERO|LESSER)\s+LICENSE/i,
  /SPDX-License-Identifier:\s*(GPL|AGPL|LGPL|MPL|SSPL)/i,
  /\bGPL-3\.0\b/i,
  /\bAGPL-3\.0\b/i,
];

const PERMISSIVE_KEYWORDS = [
  /SPDX-License-Identifier:\s*(MIT|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|ISC)/i,
  /Permission is hereby granted, free of charge/i,
  /Apache License,\s+Version 2\.0/i,
];

export class PlagiarismScanner {
  constructor(private readonly corpus: CorpusEntry[] = []) {}

  /** Build 5-gram fingerprints for an arbitrary text body. */
  static fingerprint(text: string, n = 5): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ').filter(Boolean);
    if (words.length < n) return [];
    const grams: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      grams.push(sha256(words.slice(i, i + n).join(' ')));
    }
    return grams;
  }

  scan(text: string): PlagiarismFinding[] {
    const findings: PlagiarismFinding[] = [];

    // 1) License-keyword scan — copyleft is highest priority.
    for (const re of COPYLEFT_KEYWORDS) {
      if (re.test(text)) {
        findings.push({
          matchedSource: 'inline-license-keyword',
          license: 'copyleft',
          similarity: 1,
          action: 'legal_kill_switch',
        });
        break;
      }
    }
    for (const re of PERMISSIVE_KEYWORDS) {
      if (re.test(text)) {
        findings.push({
          matchedSource: 'inline-license-keyword',
          license: 'permissive',
          similarity: 1,
          action: 'attribute',
        });
        break;
      }
    }

    // 2) Corpus fingerprint match.
    const fps = new Set(PlagiarismScanner.fingerprint(text));
    if (fps.size === 0) return findings;
    for (const entry of this.corpus) {
      const matches = entry.fingerprints.filter(fp => fps.has(fp)).length;
      if (matches === 0) continue;
      const similarity = matches / Math.max(fps.size, entry.fingerprints.length);
      if (similarity < 0.15) continue;             // ignore weak matches
      const action: PlagiarismFinding['action'] =
        entry.license === 'copyleft'   ? 'legal_kill_switch'
      : entry.license === 'permissive' ? 'attribute'
      :                                  'flag_for_review';
      findings.push({
        matchedSource: entry.source,
        license: entry.license,
        attribution: entry.attribution,
        similarity: Math.round(similarity * 1000) / 1000,
        action,
      });
    }
    return findings;
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
