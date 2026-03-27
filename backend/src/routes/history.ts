/**
 * history.ts
 *
 * GET  /history     — Fetch the authenticated user's last 20 history entries
 * POST /history     — Save a new history entry
 * DELETE /history   — Clear all history for the authenticated user
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSupabaseClient } from '../lib/supabase';

const router = Router();

// GET /history
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('user_history')
      .select('id, prompt, result, created_at')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { res.status(500).json({ error: 'Failed to fetch history.' }); return; }

    res.json({ history: data ?? [] });
  } catch (err) {
    next(err);
  }
});

// POST /history
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { prompt, result } = req.body ?? {};

  if (!prompt || typeof prompt !== 'string' || !result || typeof result !== 'object') {
    res.status(400).json({ error: 'prompt and result are required.' });
    return;
  }

  try {
    // Keep only the latest 20 entries — delete oldest if over limit before inserting.
    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('user_history')
      .select('id, created_at')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false });

    if (existing && existing.length >= 20) {
      const toDelete = existing.slice(19).map((r: { id: string }) => r.id);
      await supabase.from('user_history').delete().in('id', toDelete);
    }

    const { data, error } = await supabase
      .from('user_history')
      .insert({ user_id: req.userId!, prompt, result })
      .select('id, prompt, result, created_at')
      .single();

    if (error) { res.status(500).json({ error: 'Failed to save history.' }); return; }

    res.status(201).json({ entry: data });
  } catch (err) {
    next(err);
  }
});

// DELETE /history
router.delete('/', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { error } = await getSupabaseClient()
      .from('user_history')
      .delete()
      .eq('user_id', req.userId!);

    if (error) { res.status(500).json({ error: 'Failed to clear history.' }); return; }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
