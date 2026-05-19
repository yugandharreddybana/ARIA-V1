/**
 * Middleware → Java Governance proxy (V27.9 §12 + §13.7 + §20).
 */
import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';

async function call<T>(method: string, path: string, bearer: string, body?: unknown): Promise<T> {
  const env = validateEnv();
  const res = await fetch(`${env.BACKEND_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new AppError(`Governance backend error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return (await res.json()) as T;
}

export const governanceProxy = {
  scan:        (body: { triggeredBy: string; triggerRef?: string; diffPath?: string; diff: string }, bearer: string) =>
                 call('POST', '/api/governance/compliance/scan', bearer, body),
  list:        (bearer: string) => call('GET',  '/api/governance/compliance', bearer),
  decide:      (id: string, body: { decidedBy: string; to: 'accepted'|'rejected'|'mitigated' }, bearer: string) =>
                 call('POST', `/api/governance/compliance/${id}/decide`, bearer, body),
  redact:      (body: { table: string; sourceId: string; column: string; originalValue?: string; reason: string; requestedBy: string }, bearer: string) =>
                 call('POST', '/api/governance/gdpr/redact', bearer, body),
  exportAudit: (body: { requestedBy: string; scope: 'soc2'|'iso'|'gdpr'|'all' }, bearer: string) =>
                 call('POST', '/api/governance/audit/export', bearer, body),
  explain:     (sessionId: string, bearer: string) =>
                 call('POST', `/api/governance/explain/${sessionId}`, bearer),
};
