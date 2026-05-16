import type { Response, NextFunction } from 'express';
import { getTokenGateway } from '../services/tokenGateway.factory';
import { TokenGatewayError } from '../services/tokenGateway.service';
import { llmInvokeSchema } from '../schemas/llm.schemas';
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
