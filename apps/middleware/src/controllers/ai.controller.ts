import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { ollamaChat, listOllamaModels } from '../services/ollama.service';
import type { OllamaMessage } from '../services/ollama.service';

export async function chat(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const { messages, model } = req.body as { messages: OllamaMessage[]; model?: string };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: 'messages array is required', code: 'VALIDATION_ERROR' });
      return;
    }
    const result = await ollamaChat(messages, model);
    res.json({ message: result.message, model: result.model });
  } catch (e) { next(e); }
}

export async function getModels(_req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ models: await listOllamaModels() }); } catch (e) { next(e); }
}
