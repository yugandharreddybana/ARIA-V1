import { validateEnv } from '../../config/env';
import { cursorCloudWorker, type CodeWorker } from '../models/codeWorker';
import { workspaceCursorKey } from '../models/cursorKey';
import { RunError } from '../runs/errors';
import { resolveActiveCredential } from './credentials.service';
import { getProvider } from './registry';

/** Resolve the coding CodeWorker from the active coding credential (fallback: Cursor). */
export async function codeWorkerForWorkspace(workspaceId: string, projectId?: string): Promise<{
  worker: CodeWorker;
  apiKey: string;
  provider: string;
  runtime: string;
}> {
  const active = await resolveActiveCredential(workspaceId, 'coding', projectId);
  if (active?.connectionStatus === 'failed') {
    throw new RunError('KEY_INVALID', 'Active coding credential is unhealthy', false);
  }
  const provider = active?.provider ?? 'cursor';
  const adapter = getProvider(provider);
  const worker = adapter?.asCoder?.() ?? cursorCloudWorker();
  if (active?.apiKey) {
    return {
      worker,
      apiKey: active.apiKey,
      provider,
      runtime: adapter?.runtime ?? 'cursor_cloud',
    };
  }
  if (validateEnv().ARIA_CURSOR_LOCAL_MODE === 'stub') {
    return {
      worker,
      apiKey: 'stub',
      provider,
      runtime: adapter?.runtime ?? 'cursor_cloud',
    };
  }
  return {
    worker,
    apiKey: await workspaceCursorKey(workspaceId),
    provider,
    runtime: adapter?.runtime ?? 'cursor_cloud',
  };
}
