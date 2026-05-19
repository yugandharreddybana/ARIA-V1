import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import { getTokenGateway } from '../services/tokenGateway.factory';
import { TokenGatewayError } from '../services/tokenGateway.service';
import { llmInvokeSchema } from '../schemas/llm.schemas';
import { OllamaDispatcher } from '../services/dispatcher.ollama';
import type { AriaRequest } from '../middleware/auth.middleware';

export async function invoke(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = llmInvokeSchema.parse(req.body);
    const gateway = getTokenGateway();
    const result = await gateway.invoke(parsed);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof TokenGatewayError) {
      const status = err.code === 'BUDGET_EXCEEDED'   ? 402
                   : err.code === 'GATEWAY_QUEUE_FULL' ? 429
                   : err.code === 'UNKNOWN_BACKEND'    ? 400 : 502;
      res.status(status).json({ success: false, error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

export function status(_req: AriaRequest, res: Response): void {
  const gateway = getTokenGateway();
  res.status(200).json({ success: true, data: gateway.status() });
}

// ── /api/llm/embed — direct embedding endpoint (Sprint 8) ───────────────────

const embedSchema = z.object({
  text:  z.string().min(1).max(50_000),
  model: z.string().min(1).max(200).optional(),
}).strict();

const embedDispatcher = new OllamaDispatcher();

export async function embed(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = embedSchema.parse(req.body);
    const out = await embedDispatcher.embed(parsed.text, parsed.model);
    res.status(200).json({ success: true, data: out });
  } catch (err) { next(err); }
}
