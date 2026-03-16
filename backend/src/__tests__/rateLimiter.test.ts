/**
 * rateLimiter.test.ts
 *
 * Unit tests for RateLimiter.
 *
 * Uses Jest fake timers so tests run instantly without real sleeps.
 * Each test calls jest.useFakeTimers() / jest.useRealTimers() explicitly
 * rather than a beforeEach so non-timer tests remain unaffected.
 *
 * Test coverage:
 *   1. Core behaviour  — allows/blocks requests, per-IP isolation, window reset
 *   2. Memory management — size getter, prune() removes expired entries only
 */

import { RateLimiter, RateLimitError } from '../middleware/rateLimiter';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Core behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('RateLimiter — core behaviour', () => {

  it('allows requests under the limit', () => {
    // Why: the happy path — clients that stay below the cap must not be blocked.
    const limiter = new RateLimiter(5, 60_000);
    expect(() => limiter.check('ip1')).not.toThrow();
    expect(() => limiter.check('ip1')).not.toThrow();
    expect(() => limiter.check('ip1')).not.toThrow();
  });

  it('throws RateLimitError when the limit is exactly reached', () => {
    // Why: limit is max requests per window. The (max+1)th request must be blocked.
    // Failure mode: an off-by-one allows one extra request through silently.
    const limiter = new RateLimiter(2, 60_000);
    limiter.check('ip1');
    limiter.check('ip1');
    expect(() => limiter.check('ip1')).toThrow(RateLimitError);
  });

  it('tracks different IPs independently', () => {
    // Why: rate limiting must be per-client, not global.
    // If two IPs share a counter, one abuser blocks everyone else.
    const limiter = new RateLimiter(1, 60_000);
    limiter.check('ip1');
    expect(() => limiter.check('ip1')).toThrow(RateLimitError);
    expect(() => limiter.check('ip2')).not.toThrow(); // different IP, fresh budget
  });

  it('resets the window after windowMs elapses', () => {
    // Why: the fixed-window contract — after windowMs, the client gets a fresh budget.
    // Without this the limiter permanently blocks any client that hit the cap.
    jest.useFakeTimers();
    const limiter = new RateLimiter(1, 1_000);
    limiter.check('ip1');
    expect(() => limiter.check('ip1')).toThrow(RateLimitError);
    jest.advanceTimersByTime(1_001); // window expired
    expect(() => limiter.check('ip1')).not.toThrow();
    jest.useRealTimers();
  });

  it('RateLimitError carries retryAfterSec and resetAt', () => {
    // Why: clients use these headers to self-throttle (Retry-After, X-RateLimit-Reset).
    // Incorrect values cause clients to retry too early or wait unnecessarily long.
    jest.useFakeTimers();
    const WINDOW_MS = 60_000;
    const limiter = new RateLimiter(1, WINDOW_MS);
    limiter.check('ip1');
    let error!: RateLimitError;
    try {
      limiter.check('ip1');
    } catch (e) {
      error = e as RateLimitError;
    }
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSec).toBeGreaterThan(0);
    expect(error.retryAfterSec).toBeLessThanOrEqual(WINDOW_MS / 1000);
    expect(typeof error.resetAt).toBe('string'); // ISO date string
    jest.useRealTimers();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Memory management — prune() and size getter
//
// Without pruning, the clients Map accumulates one entry per unique IP address
// that ever made a request. On a public server, this is a slow memory leak:
// millions of unique IPs over time → unbounded Map growth.
//
// prune() removes entries whose window has already expired — they will be
// re-created from scratch the next time that IP makes a request anyway.
// ─────────────────────────────────────────────────────────────────────────────

describe('RateLimiter — memory management', () => {

  it('size getter reflects the number of currently tracked IPs', () => {
    // Why: size lets operators (and tests) observe internal state without
    // reaching into private fields. Useful for health checks and metrics.
    const limiter = new RateLimiter(5, 60_000);
    expect(limiter.size).toBe(0);
    limiter.check('ip1');
    limiter.check('ip2');
    expect(limiter.size).toBe(2);
  });

  it('prune() removes only expired entries, leaving active entries intact', () => {
    // Why: we must not evict entries whose window is still live —
    // that would reset a client's request counter mid-window, allowing bypass.
    jest.useFakeTimers();
    const WINDOW_MS = 1_000;
    const limiter = new RateLimiter(5, WINDOW_MS);

    // ip-active: created at t=0, window expires at t=1000
    limiter.check('ip-active');
    // Advance 500ms — ip-active window is at 500ms (still live)
    jest.advanceTimersByTime(500);
    // ip-will-expire: created at t=500, window expires at t=1500
    limiter.check('ip-will-expire');
    // Advance another 600ms → now t=1100
    // ip-active:      expires at t=1000 → EXPIRED (1100 >= 1000)
    // ip-will-expire: expires at t=1500 → still active
    jest.advanceTimersByTime(600);

    limiter.prune();

    expect(limiter.size).toBe(1); // only ip-will-expire remains
    jest.useRealTimers();
  });

  it('prune() removes all entries when every window has expired', () => {
    // Why: after a traffic spike, expired entries from many unique IPs
    // must be cleaned up — not retained until the server restarts.
    jest.useFakeTimers();
    const limiter = new RateLimiter(5, 1_000);
    limiter.check('ip1');
    limiter.check('ip2');
    limiter.check('ip3');
    expect(limiter.size).toBe(3);

    jest.advanceTimersByTime(1_001); // all windows expired
    limiter.prune();

    expect(limiter.size).toBe(0);
    jest.useRealTimers();
  });

  it('prune() returns the number of entries removed', () => {
    // Why: callers (e.g. metrics or health endpoints) should be able to log
    // how many stale entries were pruned without inspecting internal state twice.
    jest.useFakeTimers();
    const limiter = new RateLimiter(5, 1_000);
    limiter.check('ip1');
    limiter.check('ip2');
    jest.advanceTimersByTime(1_001);
    const removed = limiter.prune();
    expect(removed).toBe(2);
    jest.useRealTimers();
  });

  it('prune() on an already-clean limiter returns 0', () => {
    // Why: prune must be safe to call idempotently at any time —
    // no crash or incorrect count when there is nothing to remove.
    const limiter = new RateLimiter(5, 60_000);
    limiter.check('ip1'); // window still live
    const removed = limiter.prune();
    expect(removed).toBe(0);
    expect(limiter.size).toBe(1); // live entry untouched
  });

});
