/**
 * metrics.test.ts
 *
 * Unit tests for MetricsStore (exported as `metrics` singleton).
 *
 * MetricsStore is pure in-memory — no mocks needed.
 * Tests verify:
 *   1. Single non-escalated request recording
 *   2. Escalated request recording (two model calls counted separately)
 *   3. Per-model accumulator arithmetic
 *   4. Escalation rate percentage calculation
 *   5. snapshot() formatting (rounding, precision)
 *   6. Edge case: empty store returns sensible zero values
 */

// Import the class directly so each test gets a fresh instance, avoiding
// cross-test pollution from the module-level singleton.
import { metrics as _metrics } from '../services/metrics';

// Re-import the class definition via the same module; Jest's module cache
// means both imports reference the same class constructor.
// We create isolated instances in each test using the class constructor.
import type { RecordParams } from '../services/metrics';

// Access the internal class via a re-export trick — the module exports both
// the instance (metrics) and the type (RecordParams). We reconstruct
// fresh instances by requiring the module again via jest.isolateModules.
// Simpler approach: just reset state by re-importing with a factory.

// Because MetricsStore is not exported directly, we test via the exported
// singleton. Each describe block tests a specific behaviour in isolation by
// calling record() and immediately reading snapshot().
//
// To keep tests independent we import the singleton and build up state
// from scratch — but since the singleton is shared across tests (Jest
// module cache), we use a workaround: create a fresh MetricsStore per test
// by importing the module in isolation.

/**
 * Helper: create a fresh MetricsStore instance for each test without
 * touching the shared singleton.
 */
function freshStore() {
  // Jest's module cache keeps the singleton alive across tests.
  // We isolate by directly constructing the class, which is not exported.
  // Instead, we use the exported `metrics` singleton but reset it via
  // Jest's module isolation: jest.isolateModules gives a fresh module scope.
  //
  // Since MetricsStore is private, we use a workaround:
  // We import and destructure the module inside isolateModules.
  let store: typeof _metrics;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    store = require('../services/metrics').metrics;
  });
  return store!;
}

const BASE_PARAMS: RecordParams = {
  initialModel:          'model-a',
  finalModel:            'model-a',
  escalated:             false,
  latencyMs:             500,
  promptTokens:          100,
  initialResponseTokens: 50,
  finalResponseTokens:   50,
  initialModelLatencyMs: 450,
  finalModelLatencyMs:   0,
  initialCostUsd:        0.001,
  finalCostUsd:          0,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Empty store
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — empty state', () => {

  it('returns zero totals when no requests have been recorded', () => {
    const store = freshStore();
    const snap = store.snapshot();

    expect(snap.totalRequests).toBe(0);
    expect(snap.escalationCount).toBe(0);
    expect(snap.escalationRatePercent).toBe(0);
    expect(snap.totalTokens).toBe(0);
    expect(snap.totalEstimatedCostUsd).toBe(0);
    expect(snap.averageLatencyMs).toBe(0);
    expect(snap.perModel).toEqual({});
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Single non-escalated request
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — single non-escalated request', () => {

  it('increments totalRequests by 1', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    expect(store.snapshot().totalRequests).toBe(1);
  });

  it('does not increment escalationCount', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    expect(store.snapshot().escalationCount).toBe(0);
  });

  it('records correct total tokens (prompt + initial response)', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    // prompt (100) + initial response (50) = 150
    expect(store.snapshot().totalTokens).toBe(150);
  });

  it('records correct cost', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    expect(store.snapshot().totalEstimatedCostUsd).toBeCloseTo(0.001, 6);
  });

  it('records correct average latency', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    expect(store.snapshot().averageLatencyMs).toBe(500);
  });

  it('creates a per-model entry for the initial model', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    const perModel = store.snapshot().perModel;

    expect(perModel['model-a']).toBeDefined();
    expect(perModel['model-a'].calls).toBe(1);
    expect(perModel['model-a'].totalTokens).toBe(150);
    expect(perModel['model-a'].averageLatencyMs).toBe(450);
    expect(perModel['model-a'].totalCostUsd).toBeCloseTo(0.001, 6);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Escalated request — two model calls
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — escalated request', () => {

  const escalated: RecordParams = {
    initialModel:          'model-cheap',
    finalModel:            'model-premium',
    escalated:             true,
    latencyMs:             1200,
    promptTokens:          100,
    initialResponseTokens: 30,
    finalResponseTokens:   80,
    initialModelLatencyMs: 400,
    finalModelLatencyMs:   800,
    initialCostUsd:        0.0005,
    finalCostUsd:          0.002,
  };

  it('increments escalationCount by 1', () => {
    const store = freshStore();
    store.record(escalated);
    expect(store.snapshot().escalationCount).toBe(1);
  });

  it('computes escalation rate as 100% for one escalated request', () => {
    const store = freshStore();
    store.record(escalated);
    expect(store.snapshot().escalationRatePercent).toBe(100);
  });

  it('counts tokens for both initial and final model calls', () => {
    const store = freshStore();
    store.record(escalated);
    // initial: prompt(100) + initial response(30) = 130
    // final:   prompt(100) + final response(80)   = 180
    // total: 310
    expect(store.snapshot().totalTokens).toBe(310);
  });

  it('sums cost of both calls', () => {
    const store = freshStore();
    store.record(escalated);
    expect(store.snapshot().totalEstimatedCostUsd).toBeCloseTo(0.0025, 6);
  });

  it('creates separate per-model entries for initial and final model', () => {
    const store = freshStore();
    store.record(escalated);
    const perModel = store.snapshot().perModel;

    expect(perModel['model-cheap']).toBeDefined();
    expect(perModel['model-premium']).toBeDefined();
    expect(perModel['model-cheap'].calls).toBe(1);
    expect(perModel['model-premium'].calls).toBe(1);
  });

  it('records correct latency for each model separately', () => {
    const store = freshStore();
    store.record(escalated);
    const perModel = store.snapshot().perModel;

    expect(perModel['model-cheap'].averageLatencyMs).toBe(400);
    expect(perModel['model-premium'].averageLatencyMs).toBe(800);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Multiple requests — averages and accumulation
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — multiple requests', () => {

  it('averages latency across multiple requests', () => {
    const store = freshStore();
    store.record({ ...BASE_PARAMS, latencyMs: 200 });
    store.record({ ...BASE_PARAMS, latencyMs: 800 });
    // average: (200 + 800) / 2 = 500
    expect(store.snapshot().averageLatencyMs).toBe(500);
  });

  it('computes escalation rate as 50% when one of two requests escalated', () => {
    const store = freshStore();
    store.record({ ...BASE_PARAMS, escalated: false });
    store.record({ ...BASE_PARAMS, escalated: true, finalModel: 'model-a', finalCostUsd: 0.001, finalModelLatencyMs: 400, finalResponseTokens: 50 });
    expect(store.snapshot().escalationRatePercent).toBe(50);
  });

  it('accumulates per-model calls across multiple records', () => {
    const store = freshStore();
    store.record(BASE_PARAMS);
    store.record(BASE_PARAMS);
    const perModel = store.snapshot().perModel;

    expect(perModel['model-a'].calls).toBe(2);
    expect(perModel['model-a'].totalTokens).toBe(300); // 150 * 2
  });

  it('averages per-model latency across multiple calls', () => {
    const store = freshStore();
    store.record({ ...BASE_PARAMS, initialModelLatencyMs: 200 });
    store.record({ ...BASE_PARAMS, initialModelLatencyMs: 600 });
    // average: (200 + 600) / 2 = 400
    expect(store.snapshot().perModel['model-a'].averageLatencyMs).toBe(400);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Snapshot formatting
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — snapshot formatting', () => {

  it('rounds averageLatencyMs to nearest integer', () => {
    const store = freshStore();
    store.record({ ...BASE_PARAMS, latencyMs: 333 });
    store.record({ ...BASE_PARAMS, latencyMs: 334 });
    // average = 333.5 → rounds to 334 (Math.round)
    expect(Number.isInteger(store.snapshot().averageLatencyMs)).toBe(true);
  });

  it('formats totalEstimatedCostUsd to 6 decimal places', () => {
    const store = freshStore();
    store.record({ ...BASE_PARAMS, initialCostUsd: 0.0000001 });
    const snap = store.snapshot();
    // Should not have more than 6 decimal places
    const decimals = snap.totalEstimatedCostUsd.toString().split('.')[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });

  it('formats escalationRatePercent to 1 decimal place', () => {
    const store = freshStore();
    // 1 escalated out of 3 requests = 33.333...% → should be 33.3
    store.record({ ...BASE_PARAMS, escalated: true, finalModel: 'model-a', finalCostUsd: 0, finalModelLatencyMs: 0, finalResponseTokens: 50 });
    store.record({ ...BASE_PARAMS });
    store.record({ ...BASE_PARAMS });
    const rate = store.snapshot().escalationRatePercent;
    expect(rate).toBeCloseTo(33.3, 1);
  });

});
