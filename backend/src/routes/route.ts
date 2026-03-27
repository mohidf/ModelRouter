import { Router, type Request, type Response, type NextFunction } from 'express';
import { routingEngine } from '../services/router';
import { requireAuth } from '../middleware/auth';
import { getUserApiKeys } from '../services/userKeyService';

const router = Router();

/**
 * POST /route
 *
 * Requires authentication. Uses the authenticated user's stored API keys.
 * Returns 403 if the user has not added any API keys yet.
 */
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { prompt, maxTokens, preferCost, optimizationMode, customWeights } = req.body ?? {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: '`prompt` is required and must be a non-empty string.' });
    return;
  }

  const MAX_PROMPT_CHARS = 20_000;
  if (prompt.length > MAX_PROMPT_CHARS) {
    res.status(400).json({ error: `Prompt must be at most ${MAX_PROMPT_CHARS} characters.` });
    return;
  }

  const MAX_TOKENS_CEILING = 32_000;
  const validatedMaxTokens =
    typeof maxTokens === 'number' && maxTokens > 0
      ? Math.min(Math.floor(maxTokens), MAX_TOKENS_CEILING)
      : undefined;

  const userApiKeys = await getUserApiKeys(req.userId!);

  if (Object.keys(userApiKeys).length === 0) {
    res.status(403).json({
      error: 'NO_KEYS',
      message: 'You have not added any API keys. Go to Settings to add your keys.',
    });
    return;
  }

  try {
    const result = await routingEngine.route({
      prompt,
      maxTokens: validatedMaxTokens,
      preferCost,
      optimizationMode,
      customWeights,
      userApiKeys,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
