/**
 * Live ticket events have two producers:
 * - the pipeline emits `{ id, status, projectId }`
 * - the legacy agent API emits `{ ticket }`
 * Consumers must accept both.
 */
export interface TicketStatusPatch {
  id: string;
  status: string;
  projectId?: string;
}

export interface TicketSocketBody {
  id: string;
  projectId?: string;
  status?: string;
}

export interface TicketSocketEnvelope {
  ticket: TicketSocketBody;
}

export type TicketUpdatedPayload = TicketStatusPatch | TicketSocketEnvelope;

export interface TicketSocketView {
  id: string;
  projectId?: string;
  status?: string;
  ticket?: TicketSocketBody;
}

export function ticketFromSocket(payload: unknown): TicketSocketView | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const wrapped = record.ticket;
  if (wrapped && typeof wrapped === 'object') {
    const ticket = wrapped as Record<string, unknown>;
    if (typeof ticket.id !== 'string' || ticket.id.length === 0) return null;
    return {
      id: ticket.id,
      projectId: typeof ticket.projectId === 'string' ? ticket.projectId : undefined,
      status: typeof ticket.status === 'string' ? ticket.status : undefined,
      ticket: {
        id: ticket.id,
        projectId: typeof ticket.projectId === 'string' ? ticket.projectId : undefined,
        status: typeof ticket.status === 'string' ? ticket.status : undefined,
      },
    };
  }
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  return {
    id: record.id,
    projectId: typeof record.projectId === 'string' ? record.projectId : undefined,
    status: typeof record.status === 'string' ? record.status : undefined,
  };
}

export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const UrlCtor = (globalThis as { URL?: new (input: string) => { protocol: string; href: string } }).URL;
  if (!UrlCtor) return null;
  try {
    const url = new UrlCtor(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Empty input clears the project budget. "1,000" is 1000. Anything else is rejected. */
export function parseMonthlyBudget(input: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  const digits = trimmed.replace(/,/g, '').replace(/\s+/g, '');
  if (!/^[1-9]\d*$/.test(digits)) return { ok: false };
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return { ok: false };
  return { ok: true, value };
}
