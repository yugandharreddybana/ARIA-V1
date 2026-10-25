import { getPgPool } from '../db.client';
import { validateEnv } from '../../config/env';
import { embeddedImages, validateReport, type ReportKind } from './reportValidation';
import { renderReportPdf } from './pdfReport';
import { sha256 } from '../runs/budget';
import { appendTicketEvent } from '../tickets/ticketEvents';

export async function storeReport(input: {
  workspaceId: string;
  projectId: string;
  ticketId: string;
  ticketKey: string;
  kind: ReportKind;
  markdown: string;
  storyPoints: number;
  agents: string[];
  runId: string | null;
  commitSha: string | null;
}): Promise<{ valid: boolean; errors: string[]; contentHash: string; pdfSha256: string }> {
  const check = validateReport(input.kind, input.markdown);
  const images = embeddedImages(input.markdown);
  const pdf = await renderReportPdf(input.markdown, {
    ticketKey: input.ticketKey,
    kind: input.kind,
    storyPoints: input.storyPoints,
    agents: input.agents,
    runId: input.runId,
    commitSha: input.commitSha,
    generatedAt: new Date().toISOString(),
  }, images);
  const contentHash = sha256(input.markdown);
  const pdfSha = sha256(pdf);
  await getPgPool().query(
    `INSERT INTO ticket_reports (
       workspace_id, project_id, ticket_id, kind, ticket_key, markdown, content_hash, pdf_sha256, pdf_bytes, valid, errors, run_id, commit_sha
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, $13
     )`,
    [
      input.workspaceId, input.projectId, input.ticketId, input.kind, input.ticketKey, input.markdown,
      contentHash, pdfSha, pdf, check.valid, JSON.stringify(check.errors), input.runId, input.commitSha,
    ],
  );
  await appendTicketEvent({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    ticketId: input.ticketId,
    eventType: 'evidence',
    actorKind: 'system',
    runId: input.runId,
    summary: `${input.kind} report ${check.valid ? 'valid' : 'invalid'}`,
    commitSha: input.commitSha,
    detail: { kind: input.kind, contentHash, pdfSha256: pdfSha, valid: check.valid, errors: check.errors },
  });
  return { valid: check.valid, errors: check.errors, contentHash, pdfSha256: pdfSha };
}

export async function latestReports(ticketId: string): Promise<{ dev: { valid: boolean } | null; qa: { valid: boolean; markdown: string } | null }> {
  const result = await getPgPool().query<{ kind: ReportKind; valid: boolean; markdown: string }>(
    `SELECT DISTINCT ON (kind) kind, valid, markdown
       FROM ticket_reports WHERE ticket_id = $1::uuid
      ORDER BY kind, created_at DESC`,
    [ticketId],
  );
  const dev = result.rows.find((row) => row.kind === 'dev') ?? null;
  const qa = result.rows.find((row) => row.kind === 'qa') ?? null;
  return { dev, qa };
}

export async function evidenceAllowsMerge(ticketId: string): Promise<{ ok: boolean; reason: string }> {
  const reports = await latestReports(ticketId);
  if (!reports.dev?.valid) return { ok: false, reason: 'developer evidence is missing or invalid' };
  if (!reports.qa?.valid) return { ok: false, reason: 'qa evidence is missing or invalid' };
  const verdict = reports.qa.markdown.match(/## Verdict\s*([\s\S]*?)(?:\n## |\s*$)/i)?.[1] ?? '';
  if (!/\bpass\b/i.test(verdict) || (/\bfail\b/i.test(verdict) && verdict.toLowerCase().indexOf('fail') < verdict.toLowerCase().indexOf('pass'))) {
    return { ok: false, reason: 'qa verdict is not pass' };
  }
  return { ok: true, reason: 'evidence accepted' };
}

export function reportLinks(ticketId: string): string {
  const base = validateEnv().ARIA_PUBLIC_URL.replace(/\/$/, '');
  return [
    `Developer evidence: ${base}/api/tickets/${ticketId}/reports/dev.md`,
    `Developer PDF: ${base}/api/tickets/${ticketId}/reports/dev.pdf`,
    `QA evidence: ${base}/api/tickets/${ticketId}/reports/qa.md`,
    `QA PDF: ${base}/api/tickets/${ticketId}/reports/qa.pdf`,
  ].join('\n');
}

export async function readReport(ticketId: string, kind: ReportKind, format: 'md' | 'pdf'): Promise<{ body: Buffer; contentType: string } | null> {
  const result = await getPgPool().query<{ markdown: string; pdf_bytes: Buffer }>(
    `SELECT markdown, pdf_bytes FROM ticket_reports
      WHERE ticket_id = $1::uuid AND kind = $2
      ORDER BY created_at DESC LIMIT 1`,
    [ticketId, kind],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (format === 'md') return { body: Buffer.from(row.markdown), contentType: 'text/markdown; charset=utf-8' };
  return { body: row.pdf_bytes, contentType: 'application/pdf' };
}
