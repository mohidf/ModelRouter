import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Global Express error handler.
 * Must be registered LAST in index.ts (after all routes).
 * Async route handlers forward errors here via next(err).
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.', details: err.message });
}
