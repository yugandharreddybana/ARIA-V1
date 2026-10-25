import { getIO } from '../../ws';

export function emitProject(projectId: string, event: string, payload: unknown): void {
  try {
    getIO().to(`project:${projectId}`).emit(event, payload);
  } catch {
    // Tests and request handlers run without the socket hub.
  }
}
