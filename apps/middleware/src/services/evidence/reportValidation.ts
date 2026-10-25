export const DEV_SECTIONS = ['Commands', 'Before', 'After', 'Screenshots', 'Logs', 'Summary'] as const;
export const QA_SECTIONS = [
  'Previous behaviour',
  'Current behaviour',
  'Diff',
  'Scenarios',
  'Regression',
  'Screenshots',
  'Verdict',
] as const;

export type ReportKind = 'dev' | 'qa';

export interface ReportValidation {
  valid: boolean;
  errors: string[];
  verdict: 'pass' | 'fail' | null;
  uiAffected: boolean;
}

function sectionBody(markdown: string, heading: string): string | null {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
  const match = pattern.exec(markdown);
  if (!match) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function validateReport(kind: ReportKind, markdown: string): ReportValidation {
  const errors: string[] = [];
  const sections = kind === 'dev' ? DEV_SECTIONS : QA_SECTIONS;
  for (const heading of sections) {
    const body = sectionBody(markdown, heading);
    if (body == null) errors.push(`missing section ${heading}`);
    else if (!body) errors.push(`empty section ${heading}`);
  }
  const before = sectionBody(markdown, kind === 'dev' ? 'Before' : 'Previous behaviour');
  const after = sectionBody(markdown, kind === 'dev' ? 'After' : 'Current behaviour');
  if (before != null && !before.trim()) errors.push('before section is empty');
  if (after != null && !after.trim()) errors.push('after section is empty');
  const uiAffected = /ui_affected:\s*yes/i.test(markdown);
  const shots = sectionBody(markdown, 'Screenshots');
  if (uiAffected && shots != null && !/!\[[^\]]*\]\([^)]+\)/.test(shots)) {
    errors.push('ui changes require before/after screenshot markdown');
  }
  let verdict: 'pass' | 'fail' | null = null;
  if (kind === 'qa') {
    const body = sectionBody(markdown, 'Verdict');
    if (body && /\bfail\b/i.test(body) && !/\bpass\b/i.test(body.split(/\bfail\b/i)[0] ?? '')) verdict = 'fail';
    else if (body && /\bpass\b/i.test(body)) verdict = 'pass';
    else if (body) errors.push('verdict must be pass or fail');
    if (verdict === 'fail') errors.push('qa verdict is fail');
  }
  const unique = [...new Set(errors)];
  return { valid: unique.length === 0, errors: unique, verdict, uiAffected };
}

const DATA_URL = /!\[[^\]]*\]\((data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+)\)/g;

export function embeddedImages(markdown: string): Array<{ alt: string; bytes: Buffer }> {
  const images: Array<{ alt: string; bytes: Buffer }> = [];
  const withAlt = /!\[([^\]]*)\]\((data:image\/(?:png|jpeg|jpg);base64,([A-Za-z0-9+/=]+))\)/g;
  for (const match of markdown.matchAll(withAlt)) {
    images.push({ alt: match[1] || 'screenshot', bytes: Buffer.from(match[3], 'base64') });
  }
  void DATA_URL;
  return images;
}
