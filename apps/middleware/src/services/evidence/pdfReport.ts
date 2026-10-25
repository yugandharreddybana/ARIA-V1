import PDFDocument from 'pdfkit';
import type { ReportKind } from './reportValidation';

export interface PdfMeta {
  ticketKey: string;
  kind: ReportKind;
  storyPoints: number;
  agents: string[];
  runId: string | null;
  commitSha: string | null;
  generatedAt: string;
}

export function renderReportPdf(markdown: string, meta: PdfMeta, images: Array<{ alt: string; bytes: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(`${meta.ticketKey} ${meta.kind} evidence`);
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Story points: ${meta.storyPoints}`);
    doc.text(`Agents: ${meta.agents.join(', ') || 'unassigned'}`);
    doc.text(`Run: ${meta.runId ?? 'n/a'}`);
    doc.text(`Commit: ${meta.commitSha ?? 'n/a'}`);
    doc.text(`Generated: ${meta.generatedAt}`);
    doc.moveDown();
    doc.fontSize(11).text(markdown.slice(0, 80_000), { width: 500 });
    for (const image of images) {
      doc.addPage();
      doc.fontSize(12).text(image.alt);
      try {
        doc.image(image.bytes, { fit: [480, 360] });
      } catch {
        doc.text('(image could not be embedded)');
      }
    }
    doc.end();
  });
}
