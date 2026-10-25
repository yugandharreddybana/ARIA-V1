import type { ZodType } from 'zod';

export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fenced.length - 1; i >= 0; i--) {
    const parsed = tryParse(fenced[i][1]);
    if (parsed !== undefined) return parsed;
  }
  const direct = tryParse(text.trim());
  if (direct !== undefined && direct !== null && typeof direct === 'object') return direct;
  let best: unknown;
  let bestLength = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const balanced = sliceBalanced(text, i);
    if (!balanced || balanced.length <= bestLength) continue;
    const parsed = tryParse(balanced);
    if (parsed !== undefined) {
      best = parsed;
      bestLength = balanced.length;
    }
  }
  if (best !== undefined) return best;
  throw new Error('No JSON object in model output');
}

function tryParse(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw.trim());
  } catch {
    return undefined;
  }
}

function sliceBalanced(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function readJson<T>(schema: ZodType<T>, raw: string): { ok: true; value: T } | { ok: false; issues: string } {
  try {
    const parsed = schema.safeParse(extractJson(raw));
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`).join('; ') };
  } catch (err) {
    return { ok: false, issues: err instanceof Error ? err.message : 'invalid json' };
  }
}

export async function parseWithRetry<T>(
  schema: ZodType<T>,
  first: string,
  retryFn: (issues: string) => Promise<string>,
): Promise<{ value: T; rawText: string; retried: boolean }> {
  const firstParsed = readJson(schema, first);
  if (firstParsed.ok) return { value: firstParsed.value, rawText: first, retried: false };
  const second = await retryFn(firstParsed.issues);
  const secondParsed = readJson(schema, second);
  if (secondParsed.ok) return { value: secondParsed.value, rawText: second, retried: true };
  throw new Error(secondParsed.issues || 'schema invalid after retry');
}
