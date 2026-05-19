/**
 * Middleware → Java Finance proxy (V27.9 §11 + §17.6).
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
    throw new AppError(`Finance backend error (${res.status}): ${text}`, res.status >= 500 ? 502 : res.status);
  }
  return (await res.json()) as T;
}

export const financeProxy = {
  estimate:        (body: unknown, bearer: string) => call('POST', '/api/finance/finops/estimate', bearer, body),
  allocate:        (body: unknown, bearer: string) => call('POST', '/api/finance/finops/allocate', bearer, body),
  proposeProcurement: (body: unknown, bearer: string) => call('POST', '/api/finance/procurement/proposals', bearer, body),
  issueCard:       (body: unknown, bearer: string) => call('POST', '/api/finance/treasury/cards', bearer, body),
  freezeCard:      (body: unknown, bearer: string) => call('POST', '/api/finance/treasury/cards/freeze', bearer, body),
  proposeArbitrage:(body: unknown, bearer: string) => call('POST', '/api/finance/arbitrage/proposals', bearer, body),
  diplomatPlaybook:(body: unknown, bearer: string) => call('POST', '/api/finance/diplomat/playbook', bearer, body),
};
