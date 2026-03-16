import { Router, type Request, type Response, type NextFunction } from 'express';
import { routingEngine } from '../services/router';

const router = Router();

/**
 * POST /route
 *
 * Body: {
 *   prompt:            string
 *   maxTokens?:        number
 *   preferCost?:       boolean
 *   optimizationMode?: 'cost' | 'quality' | 'balanced'
 *   customWeights?:    { confidenceWeight?, costWeight?, latencyWeight?, escalationWeight? }
 * }
 * Returns: RouteResponse — classification, selected model, and completion.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

  try {
    const result = await routingEngine.route({ prompt, maxTokens: validatedMaxTokens, preferCost, optimizationMode, customWeights });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
