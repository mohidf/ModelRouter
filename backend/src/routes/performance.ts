import { Router, type Request, type Response } from 'express';
import type { TaskDomain } from '../providers/types';
import { performanceStore } from '../services/performanceStore';
import { strategyEngine }   from '../services/strategyEngine';

const DOMAINS: TaskDomain[] = ['coding', 'math', 'creative', 'general'];

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

  const byTaskType: Record<string, unknown> = {};
  for (const domain of DOMAINS) {
    const ranked = await strategyEngine.rankStats(domain);
    byTaskType[domain] = {
      best:      ranked[0]        ?? null,
      bestScore: ranked[0]?.score ?? null,
      all:       ranked,
    };
  }

  res.json({ epsilon, byTaskType });
});

export default router;
