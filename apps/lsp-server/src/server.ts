#!/usr/bin/env node
/**
 * ARIA Language Server (V27.9 §18M).
 *
 * Capabilities (Sprint 11 scope):
 *   - textDocument/hover            → Concept Graph hover (Level 1 + Level 4 summaries)
 *   - executeCommand                → ghost-text diff accept/reject + /fix /test /explain etc.
 *   - file lock indicator           → emitted as a custom `aria/lockState` notification
 *
 * Diagnostics streaming + ghost-text-diff edits are Sprint 14 wiring (the lock and hover
 * primitives have to settle first under real editor traffic).
 *
 * Transport: stdio (default for VS Code language clients).  The websocket variant lands in
 * Sprint 14 alongside the JetBrains + Neovim integrations.
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  type Hover,
  type HoverParams,
  type InitializeResult,
  TextDocumentSyncKind,
  MarkupKind,
  type ExecuteCommandParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { AriaClient, type HoverPayload } from './aria-client';

const ARIA_URL    = process.env.ARIA_MIDDLEWARE_URL ?? 'http://localhost:3001';
const ARIA_AGENT  = process.env.ARIA_AGENT_ID ?? 'lsp-editor';

const connection = createConnection(ProposedFeatures.all);
const documents  = new TextDocuments(TextDocument);
const aria       = new AriaClient(ARIA_URL, () => process.env.ARIA_ACCESS_TOKEN);

connection.onInitialize((): InitializeResult => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider:    true,
    executeCommandProvider: {
      commands: [
        'aria.dispatch.fix',
        'aria.dispatch.test',
        'aria.dispatch.explain',
        'aria.dispatch.redTeam',
        'aria.dispatch.compliance',
        'aria.dispatch.designCheck',
        'aria.diff.accept',
        'aria.diff.reject',
        'aria.lock.acquire',
        'aria.lock.release',
      ],
    },
  },
}));

connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const projectId = process.env.ARIA_PROJECT_ID;
  if (!projectId) return null;
  const filePath = params.textDocument.uri.replace(/^file:\/\//, '');
  const line = doc.getText({
    start: { line: params.position.line, character: 0 },
    end:   { line: params.position.line, character: Number.MAX_SAFE_INTEGER },
  });
  const symbol = (line.slice(0, params.position.character).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0]) ??
                 (line.slice(params.position.character).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]) ?? '';
  if (!symbol) return null;
  try {
    const { data } = await aria.hover({ projectId, filePath, symbol, cursorLine: params.position.line });
    return { contents: { kind: MarkupKind.Markdown, value: renderHover(data) } };
  } catch (e) {
    connection.console.warn(`hover failed: ${(e as Error).message}`);
    return null;
  }
});

connection.onExecuteCommand(async (params: ExecuteCommandParams): Promise<unknown> => {
  const cmd = params.command;
  const args = (params.arguments?.[0] ?? {}) as Record<string, unknown>;
  try {
    if (cmd === 'aria.diff.accept' || cmd === 'aria.diff.reject') {
      return aria.diffDecision({
        agentId:    String(args.agentId ?? ARIA_AGENT),
        sessionId:  args.sessionId as string | undefined,
        filePath:   String(args.filePath ?? ''),
        diffHash:   String(args.diffHash ?? ''),
        decision:   cmd === 'aria.diff.accept' ? 'accepted' : 'rejected',
        decidedBy:  String(args.decidedBy ?? 'user'),
        diffExcerpt: args.diffExcerpt as string | undefined,
      });
    }
    if (cmd === 'aria.lock.acquire') {
      return aria.acquireLock({
        path:    String(args.path ?? ''),
        agentId: String(args.agentId ?? ARIA_AGENT),
        ttlSeconds: args.ttlSeconds as number | undefined,
        sessionId:  args.sessionId as string | undefined,
        reason:     args.reason as string | undefined,
      });
    }
    if (cmd === 'aria.lock.release') {
      return aria.releaseLock({
        path:    String(args.path ?? ''),
        agentId: String(args.agentId ?? ARIA_AGENT),
      });
    }
    const command = cmd.replace(/^aria\.dispatch\./, '');
    return aria.dispatchTask({
      command,
      agentId:   ARIA_AGENT,
      projectId: args.projectId  as string | undefined,
      filePath:  args.filePath   as string | undefined,
      selection: args.selection  as string | undefined,
      cursorLine: args.cursorLine as number | undefined,
    });
  } catch (e) {
    connection.console.warn(`executeCommand ${cmd} failed: ${(e as Error).message}`);
    return { success: false, error: (e as Error).message };
  }
});

documents.listen(connection);
connection.listen();

export function renderHover(data: HoverPayload): string {
  const lines: string[] = [];
  lines.push(`**${data.symbol}** — \`${data.filePath}\``);
  if (data.summary) lines.push('', data.summary);
  if (data.module)  lines.push('', `**module:** ${data.module}`);
  if (data.domain)  lines.push('', `**domain:** ${data.domain}`);
  if (data.decisions?.length) {
    lines.push('', '**governing ADRs:**');
    for (const d of data.decisions) lines.push(`- \`${d.adrId}\` — ${d.title}: ${d.summary}`);
  }
  if (data.latencyMs) lines.push('', `_distill: ${data.latencyMs} ms_`);
  return lines.join('\n');
}
