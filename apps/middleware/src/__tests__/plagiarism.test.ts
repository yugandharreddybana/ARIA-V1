import { describe, it, expect } from 'vitest';
import { PlagiarismScanner } from '../services/plagiarism.service';

describe('PlagiarismScanner', () => {
  it('hard-flags copyleft license keywords as legal_kill_switch', () => {
    const s = new PlagiarismScanner();
    const findings = s.scan(`/*
     * SPDX-License-Identifier: GPL-3.0
     * Copyright (c) 2020 someone
     */
    export function magic() { return 1; }`);
    expect(findings[0].license).toBe('copyleft');
    expect(findings[0].action).toBe('legal_kill_switch');
  });

  it('flags permissive license keywords for attribution', () => {
    const s = new PlagiarismScanner();
    const findings = s.scan(`/*
     * SPDX-License-Identifier: MIT
     */
    export function magic() { return 1; }`);
    expect(findings[0].license).toBe('permissive');
    expect(findings[0].action).toBe('attribute');
  });

  it('returns no findings on clean code', () => {
    const s = new PlagiarismScanner();
    expect(s.scan(`export function add(a: number, b: number): number { return a + b; }`)).toEqual([]);
  });

  it('detects n-gram overlap with corpus and classifies by license', () => {
    const sourceText =
      'this is a unique phrase used by a copyleft library to allocate memory and ' +
      'manage internal buffers for high throughput streaming operations and zero copy';
    const fingerprints = PlagiarismScanner.fingerprint(sourceText);
    const scanner = new PlagiarismScanner([
      { source: 'github.com/example/copyleft-lib', license: 'copyleft',
        attribution: 'example/copyleft-lib', fingerprints },
    ]);
    const findings = scanner.scan(sourceText + ' extra trailing words to push past minimum length');
    const copyleft = findings.find(f => f.matchedSource === 'github.com/example/copyleft-lib');
    expect(copyleft).toBeDefined();
    expect(copyleft!.action).toBe('legal_kill_switch');
    expect(copyleft!.similarity).toBeGreaterThan(0.15);
  });
});
