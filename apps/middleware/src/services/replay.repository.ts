/**
 * Persistent ReplayFrame repository — minimal pg client wrapper for Sprint 5.
 * Sprint 14 swaps this for the full Replay Engine with SQLite mirror.
 */

import { Client } from 'pg';
import type { ReplayFrame, ReplayFrameRepository, Priority } from './tokenGateway.service';

type QueuedFields = Omit<
  ReplayFrame,
  'id' | 'dispatchedAt' | 'completedAt' | 'promptTokensActual'
  | 'responseHash' | 'responseFull' | 'responseTokens' | 'totalTokens'
  | 'outcomeObjectRef' | 'error'
>;

export class PgReplayFrameRepository implements ReplayFrameRepository {
  constructor(private readonly client: Pick<Client, 'query'>) {}

  async insertQueued(frame: QueuedFields): Promise<string> {
    const { rows } = await this.client.query<{ id: string }>(
      `INSERT INTO replay_frames (
        session_id, agent_id, skill_slug, request_id, priority,
        model_backend, model_id, model_parameters,
        prompt_hash, prompt_full, context_window_tokens,
        system_message, injected_context_refs, prompt_tokens_estimated,
        status, retained_indefinitely, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
      ) RETURNING id::text`,
      [
        frame.sessionId,
        frame.agentId,
        frame.skillSlug,
        frame.requestId,
        frame.priority as Priority,
        frame.modelBackend,
        frame.modelId,
        JSON.stringify(frame.modelParameters),
        frame.promptHash,
        frame.promptFull,
        frame.contextWindowTokens,
        frame.systemMessage,
        frame.injectedContextRefs ? JSON.stringify(frame.injectedContextRefs) : null,
        frame.promptTokensEstimated,
        frame.status,
        frame.retainedIndefinitely,
        frame.createdAt,
      ],
    );
    return rows[0].id;
  }

  async markDispatched(id: string): Promise<void> {
    await this.client.query(
      `UPDATE replay_frames SET status='dispatched', dispatched_at=NOW() WHERE id=$1::uuid`,
      [id],
    );
  }

  async markCompleted(
    id: string,
    f: { responseHash: string; responseFull: string; responseTokens: number; totalTokens: number; promptTokensActual: number },
  ): Promise<void> {
    await this.client.query(
      `UPDATE replay_frames
         SET status='completed',
             response_hash=$2,
             response_full=$3,
             response_tokens=$4,
             total_tokens=$5,
             prompt_tokens_actual=$6,
             completed_at=NOW()
       WHERE id=$1::uuid`,
      [id, f.responseHash, f.responseFull, f.responseTokens, f.totalTokens, f.promptTokensActual],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.client.query(
      `UPDATE replay_frames SET status='failed', error=$2, completed_at=NOW() WHERE id=$1::uuid`,
      [id, error],
    );
  }

  async markRejected(id: string, error: string): Promise<void> {
    await this.client.query(
      `UPDATE replay_frames SET status='rejected', error=$2, completed_at=NOW() WHERE id=$1::uuid`,
      [id, error],
    );
  }
}
