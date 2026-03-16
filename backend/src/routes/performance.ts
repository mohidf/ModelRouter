import { Router, type Request, type Response } from 'express';
import { ALL_DOMAINS } from '../providers/types';
import { performanceStore } from '../services/performanceStore';
import { strategyEngine }   from '../services/strategyEngine';

// Derived from the canonical ALL_DOMAINS constant — stays in sync automatically.
const DOMAINS = ALL_DOMAINS;

const router = Router();

/**
 * GET /performance
 *
 * Returns optimization insight data for every task domain:
 *   - epsilon: configured exploration probability from StrategyEngine
 *   - byTaskType: per-domain breakdown of ranked (provider, tier) options
 *       best      — highest-scoring PerformanceStats + its score
 *       bestScore — numeric score of the winner (null if no data)
 *       all       — all recorded options sorted best-first, each with score
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const { epsilon } = strategyEngine;

  // Fire all 11 domain queries in parallel rather than sequentially.
  // Promise.allSettled guarantees every slot is filled even if individual
  // Supabase calls fail — a single domain error never blocks the others.
  const results = await Promise.allSettled(
    DOMAINS.map(domain => strategyEngine.rankStats(domain)),
  );

  const byTaskType: Record<string, unknown> = {};
  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      const ranked = result.value;
      byTaskType[domain] = {
        best:      ranked[0]        ?? null,
        bestScore: ranked[0]?.score ?? null,
        all:       ranked,
      };
    } else {
      byTaskType[domain] = { best: null, bestScore: null, all: [] };
    }
  }

  res.json({ epsilon, byTaskType });
});

export default router;
