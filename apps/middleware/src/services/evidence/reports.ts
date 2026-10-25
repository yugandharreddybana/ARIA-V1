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
  uiFromDiff?: boolean;
}): Promise<{ valid: boolean; errors: string[]; contentHash: string; pdfSha256: string }> {
  const markdown = input.markdown.slice(0, 200_000);
  const check = validateReport(input.kind, markdown, { uiFromDiff: input.uiFromDiff });
  const images = embeddedImages(markdown).slice(0, 8);
  const pdf = await renderReportPdf(input.markdown, {
    ticketKey: input.ticketKey,
    kind: input.kind,
    storyPoints: input.storyPoints,
    agents: input.agents,
    runId: input.runId,
    commitSha: input.commitSha,
    generatedAt: new Date().toISOString(),
  }, images);
  const contentHash = sha256(markdown);
  const pdfSha = sha256(pdf);
  await getPgPool().query(
    `INSERT INTO ticket_reports (
       workspace_id, project_id, ticket_id, kind, ticket_key, markdown, content_hash, pdf_sha256, pdf_bytes, valid, errors, run_id, commit_sha
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, $13
     )`,
    [
      input.workspaceId, input.projectId, input.ticketId, input.kind, input.ticketKey, markdown,
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

export async function evidenceAllowsMerge(ticketId: string, headSha?: string | null): Promise<{ ok: boolean; reason: string }> {
  let sha = headSha ?? null;
  if (!sha) {
    const head = await getPgPool().query<{ head_sha: string | null }>(
      `SELECT head_sha FROM agent_runs WHERE ticket_id = $1::uuid AND head_sha IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [ticketId],
    );
    sha = head.rows[0]?.head_sha ?? null;
  }
  if (!sha) return { ok: false, reason: 'pull request head is unknown' };
  const result = await getPgPool().query<{ kind: ReportKind; valid: boolean; markdown: string; commit_sha: string | null }>(
    `SELECT kind, valid, markdown, commit_sha
       FROM ticket_reports
      WHERE ticket_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 40`,
    [ticketId],
  );
  const qa = result.rows.find((row) => row.kind === 'qa' && row.commit_sha === sha) ?? null;
  let dev = result.rows.find((row) => row.kind === 'dev' && row.commit_sha === sha) ?? null;
  if (!dev) {
    const builtOn = result.rows.find((row) => row.kind === 'dev' && row.valid && row.commit_sha);
    if (builtOn) {
      // The succeeded develop/fix head is the commit the QA report was written against.
      // This is not a git ancestry walk; the repo is not cloned on this path.
      const parent = await getPgPool().query(
        `SELECT 1 FROM agent_runs
          WHERE ticket_id = $1::uuid AND activity IN ('develop', 'fix')
            AND status = 'succeeded' AND head_sha = $2
          LIMIT 1`,
        [ticketId, builtOn.commit_sha],
      );
      if (parent.rowCount) dev = builtOn;
    }
  }
  if (!dev?.valid) return { ok: false, reason: 'developer evidence is missing or invalid for this pull request head' };
  if (!qa?.valid) return { ok: false, reason: 'qa evidence is missing or invalid for this pull request head' };
  const parsed = validateReport('qa', qa.markdown);
  if (parsed.verdict !== 'pass') return { ok: false, reason: 'qa verdict is not pass' };
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
