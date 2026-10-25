import { getIO } from '../../ws';

type ProjectListener = (projectId: string, event: string, payload: unknown) => void;
const listeners = new Set<ProjectListener>();

export function onProjectEvent(listener: ProjectListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProject(projectId: string, event: string, payload: unknown): void {
  for (const listener of listeners) listener(projectId, event, payload);
  try {
    getIO().to(`project:${projectId}`).emit(event, payload);
  } catch {
    // Tests and request handlers run without the socket hub.
  }
}
