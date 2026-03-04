import { Router, Request, Response } from 'express';
import { metrics } from '../services/metrics';

const router = Router();

/**
 * GET /metrics
 *
 * Returns in-memory routing statistics:
 *   - totalRequests, escalationCount, escalationRatePercent
 *   - totalTokens, totalEstimatedCostUsd
 *   - averageLatencyMs (end-to-end request average)
 *   - perModel: { calls, averageLatencyMs, totalTokens, totalCostUsd }
 */
router.get('/', (_req: Request, res: Response): void => {
  res.json(metrics.snapshot());
});

export default router;
