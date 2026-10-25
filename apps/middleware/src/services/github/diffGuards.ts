const SENSITIVE = [
  /^\.github\/workflows\/.+/i,
  /^\.cursor\/.+/i,
  /(^|\/)CODEOWNERS$/i,
  /(^|\/)\.env(\.|$)/i,
  /\.pem$/i,
  /(^|\/)Dockerfile/i,
  /(^|\/)[^/]*lock\.(json|yaml|yml)$/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)yarn\.lock$/i,
];

const SECRET = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /cursor_[A-Za-z0-9]{16,}/,
  /gho_[A-Za-z0-9]{16,}/,
  /ghs_[A-Za-z0-9]{16,}/,
  /ghu_[A-Za-z0-9]{16,}/,
  /ghr_[A-Za-z0-9]{16,}/,
];

export function diffHunkLines(diff: string): Map<string, Set<number>> {
  const lines = new Map<string, Set<number>>();
  let file = '';
  let next = 0;
  for (const raw of diff.split('\n')) {
    const header = raw.match(/^\+\+\+ b\/(.+)$/);
    if (header) {
      file = header[1];
      if (!lines.has(file)) lines.set(file, new Set());
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (!file || raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('@@')) continue;
    if (raw.startsWith('+')) {
      lines.get(file)?.add(next);
      next += 1;
    } else if (raw.startsWith('-') || raw.startsWith('\\')) {
      continue;
    } else {
      lines.get(file)?.add(next);
      next += 1;
    }
  }
  return lines;
}

export function diffTouchesUi(files: string[]): boolean {
  return files.some((file) => {
    const path = file.replace(/\\/g, '/');
    return path.startsWith('apps/web/') || path.endsWith('.tsx') || path.endsWith('.css');
  });
}

export function sensitivePaths(files: string[]): string[] {
  return files.filter((file) => SENSITIVE.some((pattern) => pattern.test(file.replace(/\\/g, '/'))));
}

export function secretFindings(patch: string): string[] {
  const hits: string[] = [];
  for (const pattern of SECRET) {
    if (pattern.test(patch)) hits.push(pattern.source);
  }
  return hits;
}

export function lockfileOnly(files: string[]): boolean {
  return files.length > 0 && files.every((file) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|[^/]*lock\.(json|yaml|yml))$/i.test(file));
}
