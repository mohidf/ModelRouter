import 'dotenv/config';
import express from 'express';
import { config, validateRequiredEnv } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { RateLimiter, createRateLimiterMiddleware } from './middleware/rateLimiter';
import routeRouter      from './routes/route';
import metricsRouter    from './routes/metrics';
import performanceRouter from './routes/performance';
import { logger } from './utils/logger';
import { hybridClassifier } from './services/hybridClassifier';

const app = express();

// --- Middleware ---
app.use(express.json({ limit: config.bodyLimit }));
app.use(requestLogger);

// --- Rate limiter (applies only to /route — provider calls) ---
const rateLimiter = new RateLimiter(config.rateLimitPerHour, 60 * 60 * 1000);

// --- Routes ---
app.use('/route',       createRateLimiterMiddleware(rateLimiter), routeRouter);
app.use('/metrics',     metricsRouter);
app.use('/performance', performanceRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Global error handler — must be last
app.use(errorHandler);

// --- Process-level safety nets ---
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

// --- Validate required env vars before binding ---
validateRequiredEnv();

// --- Start ---
app.listen(config.port, () => {
  logger.info('ModelRouter AI backend running', {
    port: config.port,
    env: process.env.NODE_ENV ?? 'development',
    confidenceThreshold: config.confidenceThreshold,
    defaultMaxTokens: config.defaultMaxTokens,
    rateLimitPerHour: config.rateLimitPerHour,
  });

  // Warn early if the embedding classifier will silently fall back to rule-based.
  if (!process.env.OPENAI_API_KEY) {
    logger.warn(
      'OPENAI_API_KEY is not set — embedding classifier disabled, ' +
      'classification will use rule-based fallback only',
    );
  }

  // Pre-compute anchor embeddings in the background so the first routed
  // request does not pay initialisation latency. Failure is non-fatal —
  // HybridClassifier falls back to rule-based on any embedding error.
  (hybridClassifier as { warmUp?: () => Promise<void> }).warmUp?.()
    .catch(err => logger.warn('Embedding warm-up failed (non-fatal)', { err: String(err) }));
});

export default app;
