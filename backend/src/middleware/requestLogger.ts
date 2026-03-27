import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path } = req;

  logger.info('Incoming request', { method, path });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[level]('Request completed', { method, path, statusCode, duration: `${duration}ms` });
  });

  next();
}
