import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { config, validateRequiredEnv } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { RateLimiter, createRateLimiterMiddleware } from './middleware/rateLimiter';
import routeRouter      from './routes/route';
import metricsRouter    from './routes/metrics';
import performanceRouter from './routes/performance';
import keysRouter        from './routes/keys';
import { logger } from './utils/logger';
import { hybridClassifier } from './services/hybridClassifier';

const app = express();

// Trust the first proxy hop so req.ip returns the real client address
// when the server runs behind a load balancer or reverse proxy (e.g. nginx,
// Render, Railway, Fly.io). Without this, all requests appear to come from
// the proxy IP and per-client rate limiting is useless.
app.set('trust proxy', 1);

// --- Middleware ---
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: config.bodyLimit }));
app.use(requestLogger);

// --- Rate limiters ---
const rateLimiter  = new RateLimiter(config.rateLimitPerHour, 60 * 60 * 1000);
const metaLimiter  = new RateLimiter(200,                     60 * 60 * 1000);

// Periodically prune expired rate-limiter entries to prevent unbounded Map growth.
// Each unique IP that ever made a request occupies one entry; without pruning,
// a traffic spike from many IPs leaves stale entries indefinitely.
const PRUNE_INTERVAL_MS = 10 * 60 * 1_000; // every 10 minutes
setInterval(() => {
  rateLimiter.prune();
  metaLimiter.prune();
}, PRUNE_INTERVAL_MS).unref(); // .unref() so this interval does not keep the process alive

// --- Routes ---
app.use('/route',       createRateLimiterMiddleware(rateLimiter),  routeRouter);
app.use('/metrics',     createRateLimiterMiddleware(metaLimiter),  metricsRouter);
app.use('/performance', createRateLimiterMiddleware(metaLimiter),  performanceRouter);
app.use('/keys',        createRateLimiterMiddleware(metaLimiter),  keysRouter);

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
