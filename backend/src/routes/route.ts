import { Router, type Request, type Response, type NextFunction } from 'express';
import { routingEngine } from '../services/router';
import { requireAuth } from '../middleware/auth';
import { getUserApiKeys } from '../services/userKeyService';
import { groqProvider, GROQ_FREE_MODELS } from '../providers/groqProvider';
import { hybridClassifier } from '../services/hybridClassifier';
import type { RouteResponse, ModelSelection } from '../providers/types';
import { config } from '../config';

const router = Router();

// ---------------------------------------------------------------------------
// Free-tier handler — called when the user has no stored API keys.
// Classifies the prompt and dispatches directly to Groq using the system key.
// ---------------------------------------------------------------------------

async function routeFreeTier(prompt: string, maxTokens: number): Promise<RouteResponse> {
  const classification = await hybridClassifier.classify(prompt);
  const { complexity } = classification;

  const tier  = complexity === 'high' ? 'premium' : complexity === 'medium' ? 'balanced' : 'cheap';
  const model = GROQ_FREE_MODELS[tier];

  const result = await groqProvider.generate(prompt, model, { tier, maxTokens });
  const cost   = groqProvider.estimateCost(model, tier, result.inputTokens, result.outputTokens);

  const modelSelection: ModelSelection = {
    provider:        'groq',
    model,
    tier,
    reason:          'Free tier — Groq Llama model',
    modelConfidence: result.modelConfidence,
  };

  return {
    classification,
    initialModel:     modelSelection,
    finalModel:       modelSelection,
    escalated:        false,
    response:         result.text,
    latencyMs:        result.latencyMs,
    totalCostUsd:     cost.totalCostUsd,
    strategyMode:     'fallback',
    evaluatedOptions: [],
    freeTier:         true,
  };
}

// ---------------------------------------------------------------------------
// POST /route
// ---------------------------------------------------------------------------

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
      : config.defaultMaxTokens;

  const userApiKeys = await getUserApiKeys(req.userId!);
  const hasUserKeys = Object.keys(userApiKeys).length > 0;

  // No user keys — serve via free Groq tier if system key is available.
  if (!hasUserKeys) {
    if (!process.env.GROQ_API_KEY) {
      res.status(403).json({
        error:   'NO_KEYS',
        message: 'You have not added any API keys. Go to Settings to add your keys.',
      });
      return;
    }
    try {
      const result = await routeFreeTier(prompt, validatedMaxTokens);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
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
