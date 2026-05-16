/**
 * Sprint 6 — IP / Plagiarism scanner smoke tests.
 * Confirms Legal Kill-Switch trips on copyleft markers and stays quiet on clean code.
 */
import { test, expect } from '@playwright/test';
import { PlagiarismScanner } from '../../middleware/src/services/plagiarism.service';

test('S6-09 copyleft SPDX header triggers legal_kill_switch', () => {
  const findings = new PlagiarismScanner().scan(
    `/* SPDX-License-Identifier: AGPL-3.0 */\nexport const x = 1;\n`
  );
  expect(findings[0].action).toBe('legal_kill_switch');
});

test('S6-10 MIT SPDX header asks for attribution', () => {
  const findings = new PlagiarismScanner().scan(
    `/* SPDX-License-Identifier: MIT */\nexport const x = 1;\n`
  );
  expect(findings[0].action).toBe('attribute');
});

test('S6-11 clean code yields no findings', () => {
  expect(new PlagiarismScanner().scan(`export const add = (a:number,b:number) => a+b;\n`)).toEqual([]);
});
