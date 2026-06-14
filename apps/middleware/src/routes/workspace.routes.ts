import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { llmConfigSchema } from '../schemas/workspace.schema';
import {
  getLlmConfigHandler,
  saveLlmConfigHandler,
  testLlmConfigHandler,
} from '../controllers/workspace.controller';

const router = Router();

router.use(requireAuth);

/** GET /api/workspace/llm-config — get current LLM config (no raw API key) */
router.get('/llm-config', getLlmConfigHandler);

/** PATCH /api/workspace/llm-config — save LLM config with optional connectivity test */
router.patch('/llm-config', validate(llmConfigSchema), saveLlmConfigHandler);

/** POST /api/workspace/llm-config/test — test connectivity without saving */
router.post('/llm-config/test', testLlmConfigHandler);

export default router;
