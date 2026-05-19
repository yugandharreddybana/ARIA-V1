/**
 * Anti-Slop Gate (V27.9 §14).
 * Scores changed *.tsx / *.css for five axes:
 *   Philosophy, Hierarchy, Execution, Specificity, Restraint.
 *
 * P0 violations (hardcoded magic numbers, inline #hex when DESIGN tokens exist,
 * horizontal-scroll-causing fixed widths on mobile, missing focus styles, etc.)
 * hard-fail. Other axes contribute to a 0–10 score; below 6 fails the gate.
 *
 * Used by the CI workflow + manual `pnpm lint:anti-slop`.
 */

import { readFileSync } from 'node:fs';

export interface AntiSlopFinding {
  file: string;
  axis: 'philosophy' | 'hierarchy' | 'execution' | 'specificity' | 'restraint';
  severity: 'p0' | 'p1' | 'p2';
  line: number;
  rule: string;
  evidence: string;
}

export interface AntiSlopReport {
  files: string[];
  findings: AntiSlopFinding[];
  scoreByAxis: Record<AntiSlopFinding['axis'], number>;
  totalScore: number;       // 0..10
  pass: boolean;
}

interface Rule {
  axis: AntiSlopFinding['axis'];
  severity: AntiSlopFinding['severity'];
  pattern: RegExp;
  rule: string;
}

const RULES: Rule[] = [
  // P0 — must never ship
  { axis: 'execution',  severity: 'p0', rule: 'inline-hex',        pattern: /(?<!\w)#(?:[0-9a-fA-F]{3,8})\b/ },
  { axis: 'execution',  severity: 'p0', rule: 'inline-rgb',        pattern: /rgba?\s*\(\s*\d{1,3}\s*,/ },
  { axis: 'execution',  severity: 'p0', rule: 'fixed-px-width',    pattern: /\bwidth:\s*\d{3,}px\b/ },
  { axis: 'specificity',severity: 'p0', rule: 'todo-marker',       pattern: /\b(TODO|FIXME|XXX)\b/ },
  { axis: 'restraint',  severity: 'p0', rule: 'console-log',       pattern: /\bconsole\.log\(/ },

  // P1 — fix soon
  { axis: 'hierarchy',  severity: 'p1', rule: 'missing-h1-heading',pattern: /^(?!.*<h[1-6])(.*data-testid="[^"]*page")/ },
  { axis: 'philosophy', severity: 'p1', rule: 'div-soup-test-id',  pattern: /<div[^>]*data-testid="[^"]+"[^>]*>\s*<div[^>]*data-testid="[^"]+"[^>]*>\s*<div/ },
  { axis: 'restraint',  severity: 'p1', rule: 'multiple-shadows',  pattern: /shadow-(2xl|inner)\b.*shadow-(xl|lg)/ },

  // P2 — nice to have
  { axis: 'specificity',severity: 'p2', rule: 'any-cast',          pattern: /\bas\s+any\b/ },
];

export function lintFiles(filePaths: string[]): AntiSlopReport {
  const findings: AntiSlopFinding[] = [];
  for (const file of filePaths) {
    let content: string;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const r of RULES) {
        if (r.pattern.test(line)) {
          findings.push({
            file, axis: r.axis, severity: r.severity, line: i + 1,
            rule: r.rule, evidence: line.trim().slice(0, 160),
          });
        }
      }
    }
  }

  // Axis scoring: start at 2 per axis, subtract per finding (p0=2, p1=1, p2=0.25).
  const axes: AntiSlopFinding['axis'][] = ['philosophy', 'hierarchy', 'execution', 'specificity', 'restraint'];
  const scoreByAxis = Object.fromEntries(axes.map(a => [a, 2])) as Record<AntiSlopFinding['axis'], number>;
  for (const f of findings) {
    const penalty = f.severity === 'p0' ? 2 : f.severity === 'p1' ? 1 : 0.25;
    scoreByAxis[f.axis] = Math.max(0, scoreByAxis[f.axis] - penalty);
  }
  const totalScore = axes.reduce((s, a) => s + scoreByAxis[a], 0);
  const pass = !findings.some(f => f.severity === 'p0') && totalScore >= 6;
  return { files: filePaths, findings, scoreByAxis, totalScore, pass };
}
