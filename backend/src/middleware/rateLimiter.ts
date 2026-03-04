/**
 * rateLimiter.ts
 *
 * Fixed-window in-memory rate limiter for provider calls.
 *
 * The window starts on the first request and resets after `windowMs`.
 * All counters live in process memory — they reset on server restart.
 *
 * Usage:
 *   const limiter = new RateLimiter(config.rateLimitPerHour, 60 * 60 * 1000);
 *   app.use('/route', createRateLimiterMiddleware(limiter), routeRouter);
 */

import type { RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Core limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private count   = 0;
  private resetAt = 0;    // epoch ms when the current window expires

  constructor(
    private readonly max:      number,
    private readonly windowMs: number,
  ) {}

  /**
   * Record one request.
   * Resets the window automatically when it has expired.
   * Throws RateLimitError if the limit has been reached.
   */
  check(): void {
    const now = Date.now();

    if (now >= this.resetAt) {
      this.count   = 0;
      this.resetAt = now + this.windowMs;
    }

    if (this.count >= this.max) {
      throw new RateLimitError(this.max, this.resetAt);
    }

    this.count++;
  }

  /** Current window snapshot — useful for diagnostics / health endpoints. */
  status(): RateLimiterStatus {
    const now = Date.now();
    return {
      count:     this.count,
      max:       this.max,
      remaining: Math.max(0, this.max - this.count),
      resetAt:   new Date(this.resetAt).toISOString(),
      windowMs:  this.windowMs,
    };
  }
}

export interface RateLimiterStatus {
  count:     number;
  max:       number;
  remaining: number;
  resetAt:   string;
  windowMs:  number;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  readonly retryAfterSec: number;
  readonly resetAt:       string;

  constructor(max: number, resetAtMs: number) {
    const retryAfterSec = Math.ceil((resetAtMs - Date.now()) / 1000);
    const resetAt       = new Date(resetAtMs).toISOString();
    super(`Rate limit exceeded — max ${max} requests per hour. Resets at ${resetAt}.`);
    this.name          = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
    this.resetAt       = resetAt;
  }
}

// ---------------------------------------------------------------------------
// Express middleware factory
// ---------------------------------------------------------------------------

export function createRateLimiterMiddleware(limiter: RateLimiter): RequestHandler {
  return (_req, res, next): void => {
    try {
      limiter.check();
      next();
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.setHeader('Retry-After', String(err.retryAfterSec));
        res.status(429).json({
          error:      err.message,
          retryAfter: err.retryAfterSec,
          resetAt:    err.resetAt,
        });
        return;
      }
      next(err);
    }
  };
}
