/**
 * Build a compressed Milestone 1 verification PDF with downscaled screenshots.
 *
 *   node scripts/build-m1-pdf.mjs
 *
 * Reads docs/verification/M1_VERIFICATION.md and docs/verification/screenshots/,
 * writes docs/verification/M1_VERIFICATION.pdf.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const verDir = path.join(root, 'docs/verification');
const shotDir = path.join(verDir, 'screenshots');
const mdPath = path.join(verDir, 'M1_VERIFICATION.md');
const htmlPath = path.join('/tmp', 'm1-verification-print.html');
const pdfRaw = path.join('/tmp', 'm1-verification-raw.pdf');
const pdfOut = path.join(verDir, 'M1_VERIFICATION.pdf');
const scaledDir = path.join('/tmp', 'm1-screenshots-scaled');

fs.mkdirSync(scaledDir, { recursive: true });

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text) {
  let out = esc(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function scalePng(src, dest, maxWidth = 960) {
  const identify = spawnSync('identify', ['-format', '%w %h', src], { encoding: 'utf8' });
  if (identify.status !== 0) {
    fs.copyFileSync(src, dest);
    return;
  }
  const [width] = identify.stdout.trim().split(/\s+/).map(Number);
  const args = width > maxWidth
    ? [src, '-resize', `${maxWidth}x`, '-strip', '-quality', '80', dest]
    : [src, '-strip', '-quality', '80', dest];
  const converted = spawnSync('convert', args, { encoding: 'utf8' });
  if (converted.status !== 0) fs.copyFileSync(src, dest);
}

for (const name of fs.readdirSync(shotDir).filter((file) => file.endsWith('.png'))) {
  scalePng(path.join(shotDir, name), path.join(scaledDir, name));
}

const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split(/\r?\n/);
const parts = [
  '<!doctype html><html><head><meta charset="utf-8"><title>Milestone 1 verification</title>',
  '<style>body{font:13px/1.4 Georgia,serif;margin:24px;color:#111}',
  'table{border-collapse:collapse;width:100%;margin:10px 0 18px}',
  'th,td{border:1px solid #ccc;padding:3px 5px;vertical-align:top;font:11px/1.3 sans-serif}',
  'th{background:#f3f3f3}code{font:11px ui-monospace,monospace}',
  'img{max-width:100%;margin:6px 0 12px;border:1px solid #ddd}',
  'h1{font-size:20px}h2{font-size:15px;margin-top:22px}</style></head><body>',
];

let i = 0;
while (i < lines.length) {
  const line = lines[i];
  if (line.startsWith('# ')) {
    parts.push(`<h1>${inline(line.slice(2))}</h1>`);
    i += 1;
    continue;
  }
  if (line.startsWith('## ')) {
    parts.push(`<h2>${inline(line.slice(3))}</h2>`);
    i += 1;
    continue;
  }
  if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      rows.push(lines[i]);
      i += 1;
    }
    const bodyRows = rows.filter((row) => !/^\|\s*-+/.test(row));
    parts.push('<table>');
    for (let ri = 0; ri < bodyRows.length; ri += 1) {
      const cells = bodyRows[ri].replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const tag = ri === 0 ? 'th' : 'td';
      parts.push(`<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>`);
      if (ri > 0) {
        for (const cell of cells) {
          const match = cell.match(/\((screenshots\/[^)]+\.png)\)/);
          if (!match) continue;
          const scaled = path.join(scaledDir, path.basename(match[1]));
          if (!fs.existsSync(scaled)) continue;
          parts.push(`</table><img src="${pathToFileURL(scaled).href}" alt="${esc(match[1])}"><table>`);
        }
      }
    }
    parts.push('</table>');
    continue;
  }
  if (!line.trim()) {
    i += 1;
    continue;
  }
  const buf = [line];
  i += 1;
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('|')) {
    buf.push(lines[i]);
    i += 1;
  }
  parts.push(`<p>${inline(buf.join(' '))}</p>`);
}
parts.push('</body></html>');
fs.writeFileSync(htmlPath, parts.join(''));

const chrome = spawnSync('google-chrome', [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfRaw}`,
  htmlPath,
], { encoding: 'utf8', timeout: 120_000 });
if (!fs.existsSync(pdfRaw)) {
  console.error(chrome.stdout, chrome.stderr);
  process.exit(1);
}

const gs = spawnSync('gs', [
  '-sDEVICE=pdfwrite',
  '-dCompatibilityLevel=1.4',
  '-dPDFSETTINGS=/ebook',
  '-dNOPAUSE',
  '-dQUIET',
  '-dBATCH',
  `-sOutputFile=${pdfOut}`,
  pdfRaw,
], { encoding: 'utf8' });
if (gs.status !== 0 || !fs.existsSync(pdfOut)) {
  fs.copyFileSync(pdfRaw, pdfOut);
}

const rawSize = fs.statSync(pdfRaw).size;
const outSize = fs.statSync(pdfOut).size;
process.stdout.write(`PDF ${outSize} bytes (raw ${rawSize})\n`);
