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
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
