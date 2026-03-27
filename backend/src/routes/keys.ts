/**
 * keys.ts
 *
 * REST endpoints for managing per-user API keys.
 *
 * GET    /keys           — List stored providers (masked, never raw keys)
 * POST   /keys           — Upsert a key for a provider
 * DELETE /keys/:provider — Remove a key for a provider
 *
 * All endpoints require a valid Bearer token (requireAuth).
 * Actual key values are never returned to the client.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSupabaseClient } from '../lib/supabase';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = new Set(['openai', 'anthropic', 'together', 'google', 'cohere']);
const API_KEY_MIN_LENGTH = 8;
const MASKED_KEY = '••••••••••••';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidProvider(value: unknown): value is string {
  return typeof value === 'string' && VALID_PROVIDERS.has(value);
}

function isValidApiKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= API_KEY_MIN_LENGTH;
}

// ---------------------------------------------------------------------------
// GET /keys
// ---------------------------------------------------------------------------

/**
 * Returns a list of providers for which the user has stored a key.
 * The response contains a masked placeholder — never the real key value.
 *
 * Response: { keys: [{ provider, maskedKey, updatedAt }] }
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId as string;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('user_api_keys')
      .select('provider, updated_at')
      .eq('user_id', userId);

    if (error) {
      next(error);
      return;
    }

    const keys = (data ?? []).map(row => ({
      provider:  row.provider as string,
      maskedKey: MASKED_KEY,
      updatedAt: row.updated_at as string,
    }));

    res.status(200).json({ keys });
  },
);

// ---------------------------------------------------------------------------
// POST /keys
// ---------------------------------------------------------------------------

/**
 * Upserts a key for the given provider.
 *
 * Body: { provider: string, apiKey: string }
 * Returns: { success: true }
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { provider, apiKey } = req.body ?? {};
    const userId = req.userId as string;

    if (!isValidProvider(provider)) {
      res.status(400).json({
        error: `Invalid provider. Must be one of: ${[...VALID_PROVIDERS].join(', ')}.`,
      });
      return;
    }

    if (!isValidApiKey(apiKey)) {
      res.status(400).json({
        error: `Invalid apiKey. Must be a string of at least ${API_KEY_MIN_LENGTH} characters.`,
      });
      return;
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('user_api_keys')
      .upsert(
        { user_id: userId, provider, api_key: apiKey },
        { onConflict: 'user_id,provider' },
      );

    if (error) {
      next(error);
      return;
    }

    res.status(200).json({ success: true });
  },
);

// ---------------------------------------------------------------------------
// DELETE /keys/:provider
// ---------------------------------------------------------------------------

/**
 * Removes the stored key for the given provider.
 *
 * Returns: { success: true }
 */
router.delete(
  '/:provider',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { provider } = req.params;
    const userId = req.userId as string;

    if (!isValidProvider(provider)) {
      res.status(400).json({
        error: `Invalid provider. Must be one of: ${[...VALID_PROVIDERS].join(', ')}.`,
      });
      return;
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      next(error);
      return;
    }

    res.status(200).json({ success: true });
  },
);

export default router;
