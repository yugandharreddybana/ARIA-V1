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
];

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
