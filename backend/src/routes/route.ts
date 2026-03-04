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

  try {
    const result = await routingEngine.route({ prompt, maxTokens, preferCost, optimizationMode, customWeights });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
