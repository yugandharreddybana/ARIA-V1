import { validateEnv } from '../../config/env';
import { loadWorkspaceLlm } from '../guardedLlm.service';
import { RunError } from '../runs/errors';

export async function workspaceCursorKey(workspaceId: string): Promise<string> {
  const llm = await loadWorkspaceLlm(workspaceId);
  if (llm?.apiKey) return llm.apiKey;
  if (validateEnv().ARIA_CURSOR_LOCAL_MODE === 'stub') return 'stub';
  throw new RunError('KEY_INVALID', 'Workspace has no Cursor key', false);
}
