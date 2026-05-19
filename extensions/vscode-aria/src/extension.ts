/**
 * VS Code extension entry point.
 *
 * Spawns the bundled ARIA LSP server over stdio, forwards configuration into its env, and
 * registers six inline commands. Hover is provided by the LSP server itself (no extra glue
 * needed). Ghost-text diff accept/reject + file lock acquire/release are surfaced as
 * `executeCommand` round-trips so the extension stays thin.
 */

import * as vscode from 'vscode';
import * as path   from 'path';
import { LanguageClient, type LanguageClientOptions, type ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aria');
  const middlewareUrl = cfg.get<string>('middlewareUrl') ?? 'http://localhost:3001';
  const agentId       = cfg.get<string>('agentId')       ?? 'lsp-editor';
  const projectId     = cfg.get<string>('projectId')     ?? '';

  const accessToken = await context.secrets.get('aria.accessToken');

  const serverModule = context.asAbsolutePath(path.join('..', '..', 'apps', 'lsp-server', 'dist', 'server.js'));
  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.stdio, options: { env: {
      ...process.env,
      ARIA_MIDDLEWARE_URL: middlewareUrl,
      ARIA_AGENT_ID:       agentId,
      ARIA_PROJECT_ID:     projectId,
      ARIA_ACCESS_TOKEN:   accessToken ?? '',
    } } },
    debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv: ['--inspect=6009'], env: {
      ...process.env,
      ARIA_MIDDLEWARE_URL: middlewareUrl,
      ARIA_AGENT_ID:       agentId,
      ARIA_PROJECT_ID:     projectId,
      ARIA_ACCESS_TOKEN:   accessToken ?? '',
    } } },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file' }],
    synchronize: { configurationSection: 'aria' },
    outputChannelName: 'ARIA',
  };

  client = new LanguageClient('aria-lsp', 'ARIA Language Server', serverOptions, clientOptions);
  await client.start();

  // Register the six dispatch commands. The bodies just forward to the LSP server's
  // executeCommand endpoint; the server already owns the HTTP round-trip to the middleware.
  for (const command of ['fix', 'test', 'explain', 'redTeam', 'compliance', 'designCheck'] as const) {
    context.subscriptions.push(vscode.commands.registerCommand(`aria.dispatch.${command}`, async () => {
      const editor = vscode.window.activeTextEditor;
      const args = {
        agentId,
        projectId,
        filePath: editor?.document.uri.fsPath,
        selection: editor?.document.getText(editor.selection),
        cursorLine: editor?.selection.active.line,
      };
      try {
        const result = await client?.sendRequest('workspace/executeCommand', {
          command: `aria.dispatch.${command}`,
          arguments: [args],
        });
        const taskId = (result as { data?: { taskId?: string } } | undefined)?.data?.taskId ?? 'unknown';
        vscode.window.showInformationMessage(`ARIA /${command} dispatched (task ${taskId})`);
      } catch (e) {
        vscode.window.showWarningMessage(`ARIA /${command} failed: ${(e as Error).message}`);
      }
    }));
  }

  // Ghost-text diff apply (V27.9 §18M, ADR-0016).
  // The LSP server logs the accept; the extension applies the WorkspaceEdit to the document
  // so the user sees the diff actually land. `aria.diff.acceptAndApply` is the editor-side
  // command bound to the LSP code-action menu in Sprint 14; for now the command palette
  // exposes it for explicit dispatch.
  context.subscriptions.push(vscode.commands.registerCommand(
    'aria.diff.acceptAndApply',
    async (payload: { filePath: string; diffHash: string; replacement: string; range?: { startLine: number; startChar: number; endLine: number; endChar: number } }) => {
      const uri = vscode.Uri.file(payload.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      const range = payload.range
        ? new vscode.Range(payload.range.startLine, payload.range.startChar, payload.range.endLine, payload.range.endChar)
        : fullRange;
      edit.replace(uri, range, payload.replacement);
      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) await doc.save();
      // Always record the decision — even if applyEdit returned false the LSP server keeps the audit row.
      await client?.sendRequest('workspace/executeCommand', {
        command: applied ? 'aria.diff.accept' : 'aria.diff.reject',
        arguments: [{ agentId, filePath: payload.filePath, diffHash: payload.diffHash, decidedBy: 'user' }],
      });
      vscode.window.showInformationMessage(applied ? 'ARIA diff applied' : 'ARIA diff rejected by editor');
    },
  ));

  // CodeLens — surfaces the six dispatch commands inline above the cursor's enclosing function
  // or class. Sprint 14 wires real symbol detection via the language client; Sprint 11 keeps
  // the lens at the top of every editable file so the affordance is visible.
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(
    { scheme: 'file' },
    {
      provideCodeLenses(document) {
        if (document.lineCount === 0) return [];
        const range = new vscode.Range(0, 0, 0, 0);
        const lenses: vscode.CodeLens[] = [];
        const labels: Array<[string, string]> = [
          ['fix',         'ARIA /fix'],
          ['test',        'ARIA /test'],
          ['explain',     'ARIA /explain'],
          ['redTeam',     'ARIA /red-team'],
          ['compliance',  'ARIA /compliance'],
          ['designCheck', 'ARIA /design-check'],
        ];
        for (const [cmd, title] of labels) {
          lenses.push(new vscode.CodeLens(range, { title, command: `aria.dispatch.${cmd}` }));
        }
        return lenses;
      },
    },
  ));
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
