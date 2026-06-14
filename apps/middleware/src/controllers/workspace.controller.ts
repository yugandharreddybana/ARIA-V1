import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { saveLlmConfig, getLlmConfig, testLlmConnectivity } from '../services/workspace.service';
import { llmConfigSchema } from '../schemas/workspace.schema';
import { validate } from '../middleware/validate.middleware';

export const validateLlmConfig = validate(llmConfigSchema);

/**
 * GET /api/workspace/llm-config
 * Returns the current LLM configuration for the caller's workspace.
 * API key is never returned — only a boolean `hasApiKey` sentinel.
 */
export async function getLlmConfigHandler(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await getLlmConfig(req.user!.workspaceId);
    res.json({ config });
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /api/workspace/llm-config
 * Saves and optionally tests the LLM configuration for the caller's workspace.
 * Body is validated by Zod llmConfigSchema (discriminated union on provider).
 */
export async function saveLlmConfigHandler(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = req.body as {
      provider: string;
      baseUrl?: string;
      model: string;
      apiKey?: string;
      testConnection?: boolean;
    };

    // Optionally test connectivity before saving
    if (body.testConnection) {
      const result = await testLlmConnectivity(
        body.provider,
        body.baseUrl,
        body.model,
        body.apiKey,
      );
      if (!result.ok) {
        res.status(422).json({
          success: false,
          error: result.message,
          code: 'LLM_CONNECTION_FAILED',
        });
        return;
      }
    }

    await saveLlmConfig(req.user!.workspaceId, req.body);
    const saved = await getLlmConfig(req.user!.workspaceId);
    res.json({ success: true, config: saved });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/workspace/llm-config/test
 * Tests connectivity to the provided LLM config WITHOUT saving it.
 * Useful for the "Test Connection" button in onboarding before confirming.
 */
export async function testLlmConfigHandler(
  req: AriaRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { provider, baseUrl, model, apiKey } = req.body as {
      provider: string;
      baseUrl?: string;
      model: string;
      apiKey?: string;
    };
    if (!provider || !model) {
      res.status(400).json({ success: false, error: 'provider and model are required', code: 'VALIDATION_ERROR' });
      return;
    }
    const result = await testLlmConnectivity(provider, baseUrl, model, apiKey);
    res.status(result.ok ? 200 : 422).json({ ...result });
  } catch (e) {
    next(e);
  }
}
