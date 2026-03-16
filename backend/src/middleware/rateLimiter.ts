/**
 * rateLimiter.ts
 *
 * Fixed-window in-memory rate limiter — per IP address.
 *
 * Each IP address gets an independent budget of `max` requests per `windowMs`.
 * The window starts on the first request from that IP and resets after
 * `windowMs`. Counters live in process memory and reset on server restart.
 *
 * Limitations (acceptable for single-server deployments):
 *   - Does not work across multiple instances — each has its own Map.
 *   - Does not persist across restarts.
 *   - IPs behind a shared proxy appear as one client.
 *     Set `trust proxy` in Express and use req.ip if needed.
 */

import type { RequestHandler } from 'express';

// ---------------------------------------------------------------------------
// Per-IP window state
// ---------------------------------------------------------------------------

interface WindowState {
  count:   number;
  resetAt: number;  // epoch ms when this window expires
}

// ---------------------------------------------------------------------------
// Core limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  /**
   * Map from client key (IP address) to its current window state.
   * Entries are lazily created on first request and cheaply cleaned up
   * when their window expires on the next request from that IP.
   */
  private readonly clients = new Map<string, WindowState>();

  constructor(
    private readonly max:      number,
    private readonly windowMs: number,
  ) {}

  /**
   * Record one request from `clientKey`.
   * Resets the window for that client automatically when it has expired.
   * Throws RateLimitError if the client's limit has been reached.
   */
  check(clientKey: string): void {
    const now = Date.now();
    const state = this.clients.get(clientKey);

    if (!state || now >= state.resetAt) {
      // New client or expired window — start a fresh window.
      this.clients.set(clientKey, { count: 1, resetAt: now + this.windowMs });
      return;
    }

    if (state.count >= this.max) {
      throw new RateLimitError(this.max, state.resetAt);
    }

    state.count++;
  }

  /**
   * Number of IP entries currently tracked in memory.
   * Includes both live and expired-but-not-yet-pruned entries.
   * Useful for health checks and observing the effect of prune().
   */
  get size(): number {
    return this.clients.size;
  }

  /**
   * Remove all entries whose window has already expired.
   *
   * Call this periodically (e.g. every 5–15 minutes) to prevent unbounded
   * Map growth on servers that receive requests from many unique IPs.
   * Expired entries are harmless — they reset automatically on the next request
   * from that IP — but they accumulate memory until pruned.
   *
   * Returns the number of entries removed.
   */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, state] of this.clients) {
      if (now >= state.resetAt) {
        this.clients.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Current window snapshot for a specific client — useful for diagnostics. */
  statusFor(clientKey: string): RateLimiterStatus {
    const now   = Date.now();
    const state = this.clients.get(clientKey);

    if (!state || now >= state.resetAt) {
      return { count: 0, max: this.max, remaining: this.max, resetAt: new Date(now + this.windowMs).toISOString(), windowMs: this.windowMs };
    }

    return {
      count:     state.count,
      max:       this.max,
      remaining: Math.max(0, this.max - state.count),
      resetAt:   new Date(state.resetAt).toISOString(),
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
  return (req, res, next): void => {
    // Use the request IP as the client key. Express sets req.ip from the
    // X-Forwarded-For header when 'trust proxy' is enabled.
    const clientKey = req.ip ?? 'unknown';
    try {
      limiter.check(clientKey);
      const status = limiter.statusFor(clientKey);
      // Standard rate-limit headers so clients can self-throttle.
      res.setHeader('X-RateLimit-Limit',     String(status.max));
      res.setHeader('X-RateLimit-Remaining', String(status.remaining));
      res.setHeader('X-RateLimit-Reset',     status.resetAt);
      next();
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.setHeader('Retry-After',           String(err.retryAfterSec));
        res.setHeader('X-RateLimit-Limit',     String(limiter.statusFor(clientKey).max));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset',     err.resetAt);
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
