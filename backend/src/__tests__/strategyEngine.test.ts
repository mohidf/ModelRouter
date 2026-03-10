/**
 * strategyEngine.test.ts
 *
 * Unit tests for StrategyEngine.
 *
 * Why this module needs mocking:
 *   StrategyEngine imports two singletons — performanceStore (Supabase-backed)
 *   and providerManager (registry of real provider instances). In unit tests
 *   we replace both with controlled fakes so tests are:
 *     - Fast: no network calls
 *     - Deterministic: we control exactly what data the engine sees
 *     - Isolated: failures point at StrategyEngine logic, not DB connectivity
 *
 * Mock paths are relative to THIS file (src/__tests__/).
 * They resolve to the same absolute paths as the imports inside strategyEngine.ts,
 * which is how Jest's module interception works.
 *
 * Test coverage:
 *   1. Cold start        — no performance data → safe fallback
 *   2. Exploitation      — with data, picks the best option
 *   3. Scoring direction — each dimension penalises/rewards in the right direction
 *   4. Normalisation     — cost and latency are correctly scaled to [0,1]
 *   5. Weight resolution — presets and custom weights apply correctly
 *   6. Weight clamping   — invalid custom weights are rejected at both layers
 *   7. Exploration bounds — complexity constrains which tiers are eligible
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be declared before any imports so Jest can hoist them
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../providers', () => ({
  providerManager: {
    resolve:         jest.fn(),
    resolveExplicit: jest.fn(),
    listProviders:   jest.fn(),
  },
}));

jest.mock('../services/performanceStore', () => ({
  performanceStore: {
    getAllStats: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports — after mocks so they receive the mocked versions
// ─────────────────────────────────────────────────────────────────────────────

import { StrategyEngine, DEFAULT_TASK_WEIGHTS } from '../services/strategyEngine';
import type { PerformanceStats }                from '../services/performanceStore';
import type { ModelTier }                       from '../providers/types';
import { providerManager }                      from '../providers';
import { performanceStore }                     from '../services/performanceStore';

// ─────────────────────────────────────────────────────────────────────────────
// Typed mock references — gives us autocomplete and type safety on mock methods
// ─────────────────────────────────────────────────────────────────────────────

const mockResolve         = jest.mocked(providerManager.resolve);
const mockResolveExplicit = jest.mocked(providerManager.resolveExplicit);
const mockListProviders   = jest.mocked(providerManager.listProviders);
const mockGetAllStats     = jest.mocked(performanceStore.getAllStats);

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A minimal ResolvedModel object satisfying the providerManager return type.
 * Used as the return value of resolve() and resolveExplicit() in tests that
 * don't inspect the returned model deeply.
 */
const MOCK_RESOLVED_MODEL = {
  provider: { name: 'openai', generate: jest.fn(), estimateCost: jest.fn() },
  model:    'gpt-4o-mini',
  tier:     'cheap' as ModelTier,
  reason:   'mock',
};

/**
 * Build a PerformanceStats object with sensible defaults.
 * Only override the fields your test cares about.
 */
function makeStat(
  provider: string,
  tier: ModelTier,
  overrides: Partial<PerformanceStats> = {},
): PerformanceStats {
  return {
    provider,
    tier,
    taskType:          'coding',
    totalRequests:     10,
    averageConfidence: 1.0,
    averageCostUsd:    0.001,
    averageLatencyMs:  200,
    escalationRate:    0.0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Set up sensible defaults so tests that don't care about these don't fail.
  // clearMocks: true in jest.config resets call counts — we re-establish
  // return values here.
  mockResolve.mockReturnValue(MOCK_RESOLVED_MODEL);
  mockResolveExplicit.mockReturnValue(MOCK_RESOLVED_MODEL);
  mockListProviders.mockReturnValue([
    { name: 'openai',    tiers: { cheap: 'gpt-4o-mini', balanced: 'gpt-4o',            premium: 'gpt-4o'         } },
    { name: 'anthropic', tiers: { cheap: 'claude-haiku', balanced: 'claude-sonnet-4-6', premium: 'claude-opus-4-6' } },
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cold start — no performance data
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — cold start', () => {

  it('uses the routing config fallback when no performance data exists', async () => {
    // Why: on first boot (or for a new domain) the performance store is empty.
    // The engine must fall back to providerManager.resolve() — the static
    // routing table — rather than throwing or producing an empty result.
    // Failure mode: an unhandled empty array causes a runtime error in exploit().
    mockGetAllStats.mockResolvedValue([]);

    const engine = new StrategyEngine();
    await engine.choose('coding', 'low');

    expect(mockResolve).toHaveBeenCalledWith('coding', 'low');
    expect(mockResolveExplicit).not.toHaveBeenCalled();
  });

  it('returns usedFallback:true when no performance data exists', async () => {
    // Why: the caller (router.ts) uses `strategyMode` to log which path was
    // taken. A cold-start fallback is distinct from exploration and exploitation.
    // If this flag is wrong, the debug logs are misleading.
    mockGetAllStats.mockResolvedValue([]);

    const engine = new StrategyEngine();
    const decision = await engine.choose('coding', 'low');

    expect(decision.usedFallback).toBe(true);
    expect(decision.explored).toBe(false);
    expect(decision.rankedOptions).toHaveLength(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Exploitation — picks the best option from performance data
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — exploitation', () => {

  it('selects the higher-scoring candidate when exploiting', async () => {
    // Why: this is the core contract of the bandit's exploit path.
    // The engine must call resolveExplicit with the BETTER candidate's
    // provider and tier, not just the first one in the array.
    // We put the worse candidate first to ensure sorting is actually happening.
    const worse  = makeStat('anthropic', 'premium', { averageConfidence: 0.5, averageCostUsd: 0.10, averageLatencyMs: 2000, escalationRate: 0.5 });
    const better = makeStat('openai',    'cheap',   { averageConfidence: 1.0, averageCostUsd: 0.001, averageLatencyMs: 200,  escalationRate: 0.0 });

    mockGetAllStats.mockResolvedValue([worse, better]); // worse listed first deliberately

    // epsilon=0: exploration never fires, always exploits
    const engine = new StrategyEngine(0);
    await engine.choose('coding', 'low');

    expect(mockResolveExplicit).toHaveBeenCalledWith(
      'openai',
      'cheap',
      expect.any(String),
    );
  });

  it('returns usedFallback:false and explored:false when exploiting', async () => {
    // Why: the strategyMode field in RouteResponse tells the UI whether the
    // decision was data-driven. Exploitation must be clearly distinguishable
    // from fallback and exploration in the audit trail.
    mockGetAllStats.mockResolvedValue([makeStat('openai', 'cheap')]);

    const engine = new StrategyEngine(0);
    const decision = await engine.choose('coding', 'low');

    expect(decision.usedFallback).toBe(false);
    expect(decision.explored).toBe(false);
  });

  it('returns ranked options from best to worst', async () => {
    // Why: the Insights UI displays all ranked options. If the sort order is
    // wrong, the UI shows a "best" option that is not what the router selected.
    const cheap   = makeStat('openai', 'cheap',   { averageCostUsd: 0.001, averageLatencyMs: 200 });
    const premium = makeStat('openai', 'premium', { averageCostUsd: 0.10,  averageLatencyMs: 2000 });

    mockGetAllStats.mockResolvedValue([premium, cheap]);

    const engine = new StrategyEngine(0);
    const decision = await engine.choose('coding', 'low');

    // cheaper/faster option should rank first
    expect(decision.rankedOptions[0].averageCostUsd).toBeLessThan(
      decision.rankedOptions[1].averageCostUsd
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Scoring direction
//
// Each test isolates one dimension by holding all others constant.
// These are the behavioral contracts of scoreStats(). If the normalization
// fix is reverted, these tests will still pass (direction doesn't change).
// The normalization regression tests in section 4 catch the magnitude issue.
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — scoring direction', () => {

  it('ranks lower cost higher (all else equal)', async () => {
    // Why: the router should prefer cheaper providers when quality is identical.
    // Failure mode: if costWeight is applied with the wrong sign, expensive
    // options win — the bandit actively routes to expensive models.
    const cheap     = makeStat('openai',    'cheap',   { averageCostUsd: 0.001 });
    const expensive = makeStat('anthropic', 'premium', { averageCostUsd: 0.10  });

    mockGetAllStats.mockResolvedValue([expensive, cheap]);
    const engine = new StrategyEngine(0);
    const ranked = await engine.rankStats('coding');

    expect(ranked[0].averageCostUsd).toBeLessThan(ranked[1].averageCostUsd);
  });

  it('ranks lower latency higher (all else equal)', async () => {
    // Why: the router should prefer faster providers when quality is identical.
    // Failure mode: wrong sign on latencyWeight routes all traffic to the
    // slowest provider, increasing end-to-end response time for users.
    const fast = makeStat('openai',    'cheap',   { averageLatencyMs: 200  });
    const slow = makeStat('anthropic', 'premium', { averageLatencyMs: 3000 });

    mockGetAllStats.mockResolvedValue([slow, fast]);
    const engine = new StrategyEngine(0);
    const ranked = await engine.rankStats('coding');

    expect(ranked[0].averageLatencyMs).toBeLessThan(ranked[1].averageLatencyMs);
  });

  it('ranks higher confidence higher (all else equal)', async () => {
    // Why: higher confidence (success rate) means the provider completes
    // more requests successfully. Wrong sign routes to the less reliable provider.
    const reliable   = makeStat('openai',    'cheap',   { averageConfidence: 1.0 });
    const unreliable = makeStat('anthropic', 'premium', { averageConfidence: 0.5 });

    mockGetAllStats.mockResolvedValue([unreliable, reliable]);
    const engine = new StrategyEngine(0);
    const ranked = await engine.rankStats('coding');

    expect(ranked[0].averageConfidence).toBeGreaterThan(ranked[1].averageConfidence);
  });

  it('ranks lower escalation rate higher (all else equal)', async () => {
    // Why: escalation doubles the cost of a request. A provider that
    // consistently needs escalation is effectively more expensive.
    // Wrong sign routes to the provider that escalates most frequently.
    const stable   = makeStat('openai',    'cheap',   { escalationRate: 0.0 });
    const unstable = makeStat('anthropic', 'premium', { escalationRate: 0.8 });

    mockGetAllStats.mockResolvedValue([unstable, stable]);
    const engine = new StrategyEngine(0);
    const ranked = await engine.rankStats('coding');

    expect(ranked[0].escalationRate).toBeLessThan(ranked[1].escalationRate);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Score normalisation — regression tests for the scale-mismatch fix
//
// Before the fix, metrics were on incompatible raw scales (USD, ms, fractions).
// These tests verify that cost and latency are correctly normalised to [0,1]
// and that the weight magnitudes are now meaningful.
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — score normalisation', () => {

  it('cost at MAX_COST_USD ($0.10) is penalised exactly twice as much as cost at $0.05', async () => {
    // Why: this is the core normalization invariant.
    // normCost = cost / MAX_COST_USD:
    //   $0.05 → 0.5,   $0.10 → 1.0
    // Score difference = costWeight * (1.0 - 0.5) = costWeight * 0.5
    //
    // Before the fix, raw costs were used:
    //   $0.05 → costWeight * 0.05 = 0.40 (with old costWeight=8)
    //   $0.10 → costWeight * 0.10 = 0.80
    //   difference: 0.40 — which had unpredictable relative impact
    //
    // With normalisation, the score difference is exactly costWeight * 0.5,
    // regardless of what the raw cost units are.
    const expensive = makeStat('openai', 'premium',  { averageCostUsd: 0.10, averageConfidence: 1.0, averageLatencyMs: 500, escalationRate: 0.0 });
    const half      = makeStat('openai', 'balanced', { averageCostUsd: 0.05, averageConfidence: 1.0, averageLatencyMs: 500, escalationRate: 0.0 });

    mockGetAllStats.mockResolvedValue([expensive, half]);
    const engine = new StrategyEngine(0);

    // Use coding weights: costWeight = 1.0, so score diff = 1.0 * 0.5 = 0.5
    const ranked = await engine.rankStats('coding');

    const costWeight = DEFAULT_TASK_WEIGHTS.coding.costWeight;
    const expectedDiff = costWeight * (1.0 - 0.5); // normCost diff = 0.5

    expect(ranked[0].averageCostUsd).toBe(0.05);    // cheaper ranks first
    expect(ranked[0].score - ranked[1].score).toBeCloseTo(expectedDiff, 5);
  });

  it('latency at MAX_LATENCY_MS (5000ms) is penalised exactly twice as much as 2500ms', async () => {
    // Why: same principle as cost — normalised latency = ms / MAX_LATENCY_MS.
    //   2500ms → 0.5,  5000ms → 1.0
    // Score difference = latencyWeight * 0.5
    //
    // Before the fix, latencyWeight * rawMs = 0.001 * 2500 = 2.5 — a huge
    // value that overwhelmed the other terms, making latency the dominant
    // factor regardless of the weight assignment.
    const slow = makeStat('openai', 'premium',  { averageLatencyMs: 5000, averageConfidence: 1.0, averageCostUsd: 0.001, escalationRate: 0.0 });
    const half = makeStat('openai', 'balanced', { averageLatencyMs: 2500, averageConfidence: 1.0, averageCostUsd: 0.001, escalationRate: 0.0 });

    mockGetAllStats.mockResolvedValue([slow, half]);
    const engine = new StrategyEngine(0);

    const ranked = await engine.rankStats('coding');

    const latencyWeight = DEFAULT_TASK_WEIGHTS.coding.latencyWeight;
    const expectedDiff  = latencyWeight * (1.0 - 0.5); // normLatency diff = 0.5

    expect(ranked[0].averageLatencyMs).toBe(2500);   // faster ranks first
    expect(ranked[0].score - ranked[1].score).toBeCloseTo(expectedDiff, 5);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Weight resolution — presets and domain defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — weight resolution', () => {

  it('returns domain-specific default weights with no override', () => {
    // Why: if the weight lookup fails silently (e.g., wrong key), all weights
    // return 0, making every candidate score identically — routing becomes random.
    const engine = new StrategyEngine();
    const weights = engine.resolveWeights('coding');

    expect(weights.confidenceWeight).toBeGreaterThan(0);
    expect(weights.costWeight).toBeGreaterThan(0);
    expect(weights.latencyWeight).toBeGreaterThan(0);
    expect(weights.escalationWeight).toBeGreaterThan(0);
  });

  it('cost mode increases costWeight above the domain default', () => {
    // Why: the cost optimization preset must actually change routing behaviour.
    // If the preset silently has no effect, the UI feature is broken.
    const engine = new StrategyEngine();
    const base = engine.resolveWeights('general');
    const cost = engine.resolveWeights('general', { optimizationMode: 'cost' });

    expect(cost.costWeight).toBeGreaterThan(base.costWeight);
  });

  it('quality mode increases confidenceWeight above the domain default', () => {
    // Why: quality mode should bias toward high-confidence (reliable) providers.
    // Same verification logic as cost mode — the preset must have a measurable effect.
    const engine = new StrategyEngine();
    const base    = engine.resolveWeights('coding');
    const quality = engine.resolveWeights('coding', { optimizationMode: 'quality' });

    expect(quality.confidenceWeight).toBeGreaterThan(base.confidenceWeight);
  });

  it('balanced mode leaves weights unchanged from domain default', () => {
    // Why: "balanced" is an explicit no-op — it exists so callers always send
    // an optimizationMode and don't have to special-case the absence of one.
    const engine = new StrategyEngine();
    const base     = engine.resolveWeights('coding');
    const balanced = engine.resolveWeights('coding', { optimizationMode: 'balanced' });

    expect(balanced).toEqual(base);
  });

  it('custom weights override the resolved value when valid', () => {
    // Why: the customWeights path must actually apply. If the spread is done
    // in the wrong order (overrides before base instead of after), custom
    // weights would be silently ignored.
    const engine = new StrategyEngine();
    const weights = engine.resolveWeights('coding', {
      customWeights: { costWeight: 9.5 },
    });

    expect(weights.costWeight).toBe(9.5);
  });

  it('custom weights only override the specified fields', () => {
    // Why: providing one custom weight must not reset the other weights to
    // undefined or zero. Each unspecified field should keep the domain default.
    const engine  = new StrategyEngine();
    const base    = engine.resolveWeights('coding');
    const weights = engine.resolveWeights('coding', {
      customWeights: { costWeight: 9.5 },
    });

    expect(weights.costWeight).toBe(9.5);
    expect(weights.confidenceWeight).toBe(base.confidenceWeight);
    expect(weights.latencyWeight).toBe(base.latencyWeight);
    expect(weights.escalationWeight).toBe(base.escalationWeight);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Weight validation — invalid custom weights are rejected
//
// These are regression tests for the clampWeight() fix.
// Before the fix, negative or non-finite weights were accepted and would
// invert the scoring function — routing to the worst available option.
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — weight validation', () => {

  it('rejects a negative costWeight and keeps the domain default', () => {
    // Why: a negative costWeight turns cost from a penalty into a reward.
    // The router would route to the MOST expensive model every time.
    // This is the most dangerous invalid input — it silently inverts routing.
    const engine = new StrategyEngine();
    const base   = engine.resolveWeights('coding');

    const weights = engine.resolveWeights('coding', {
      customWeights: { costWeight: -50 },
    });

    expect(weights.costWeight).toBe(base.costWeight);
  });

  it('rejects Infinity as a weight and keeps the domain default', () => {
    // Why: Infinity * any-metric = Infinity. One infinite term makes all
    // scores identical at -Infinity, breaking the ranking entirely.
    const engine = new StrategyEngine();
    const base   = engine.resolveWeights('general');

    const weights = engine.resolveWeights('general', {
      customWeights: { latencyWeight: Infinity },
    });

    expect(weights.latencyWeight).toBe(base.latencyWeight);
  });

  it('rejects NaN as a weight and keeps the domain default', () => {
    // Why: NaN propagates through arithmetic — any score involving NaN becomes
    // NaN. NaN comparisons always return false, so the ranking loop would
    // never update `bestScore` and the winner would be null (causing a crash).
    const engine = new StrategyEngine();
    const base   = engine.resolveWeights('math');

    const weights = engine.resolveWeights('math', {
      customWeights: { escalationWeight: NaN },
    });

    expect(weights.escalationWeight).toBe(base.escalationWeight);
  });

  it('accepts zero as a valid weight (disables that dimension)', () => {
    // Why: a user may legitimately want to ignore one dimension entirely.
    // Zero is valid — it removes that term from the score. It must not be
    // rejected by the isFinite check (which passes for 0) or the ≥0 check.
    const engine  = new StrategyEngine();
    const weights = engine.resolveWeights('coding', {
      customWeights: { latencyWeight: 0 },
    });

    expect(weights.latencyWeight).toBe(0);
  });

  it('clamps weights above 100 to 100', () => {
    // Why: absurdly large weights (e.g. 999999) make one dimension so dominant
    // that the others are invisible. We cap at 100 as a sanity bound.
    const engine  = new StrategyEngine();
    const weights = engine.resolveWeights('coding', {
      customWeights: { confidenceWeight: 500 },
    });

    expect(weights.confidenceWeight).toBe(100);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Exploration bounds — complexity constrains eligible tiers
//
// Before the fix, exploreRandom() pulled from all (provider × tier) combinations
// regardless of task complexity. A high-complexity task could be routed to the
// cheap tier on 10% of requests, giving users a degraded response.
// ─────────────────────────────────────────────────────────────────────────────

describe('StrategyEngine — exploration tier bounds', () => {

  /**
   * Run choose() for every possible pool index, controlling Math.random()
   * to select each entry in turn. Returns all tier arguments passed to
   * resolveExplicit() across all those calls.
   *
   * For high complexity the pool is:
   *   [openai/balanced, openai/premium, anthropic/balanced, anthropic/premium]
   *   (2 providers × 2 valid tiers = 4 entries)
   * For low complexity the pool is:
   *   [openai/cheap, openai/balanced, anthropic/cheap, anthropic/balanced]
   *   (2 providers × 2 valid tiers = 4 entries)
   */
  async function collectExploredTiers(
    complexity: 'low' | 'high',
    poolSize: number,
  ): Promise<string[]> {
    // epsilon=1 means exploration always fires — no need to control Math.random
    // for the epsilon check. The spy only needs to control the pool-pick index.
    const engine = new StrategyEngine(1);

    // Need at least one data point so we don't take the cold-start path
    // (cold start calls resolve(), not resolveExplicit(), skipping exploration)
    mockGetAllStats.mockResolvedValue([makeStat('openai', 'balanced')]);

    const capturedTiers: string[] = [];
    mockResolveExplicit.mockImplementation((_providerName: string, tier: string) => {
      capturedTiers.push(tier);
      return MOCK_RESOLVED_MODEL;
    });

    const randomSpy = jest.spyOn(Math, 'random');

    for (let i = 0; i < poolSize; i++) {
      // Math.floor(i/poolSize * poolSize) = i — selects index i from the pool
      randomSpy.mockReturnValue(i / poolSize);
      await engine.choose('coding', complexity);
    }

    randomSpy.mockRestore();
    return capturedTiers;
  }

  it('never selects cheap tier during exploration for high complexity', async () => {
    // Why: routing a high-complexity prompt to the cheap tier produces a
    // shallow response. Exploration should compare providers at appropriate
    // capability levels, not degrade quality for the sake of the algorithm.
    //
    // Pool for high: [openai/balanced, openai/premium, anthropic/balanced, anthropic/premium]
    const tiers = await collectExploredTiers('high', 4);

    expect(tiers).not.toContain('cheap');
    expect(tiers.every(t => t === 'balanced' || t === 'premium')).toBe(true);
  });

  it('never selects premium tier during exploration for low complexity', async () => {
    // Why: routing a simple prompt to the premium tier wastes money.
    // A cheap/balanced model handles low-complexity prompts just as well.
    // Exploration should stay within cost-appropriate tiers.
    //
    // Pool for low: [openai/cheap, openai/balanced, anthropic/cheap, anthropic/balanced]
    const tiers = await collectExploredTiers('low', 4);

    expect(tiers).not.toContain('premium');
    expect(tiers.every(t => t === 'cheap' || t === 'balanced')).toBe(true);
  });

  it('allows all tiers during exploration for medium complexity', async () => {
    // Why: medium complexity sits in the middle — the engine should be able
    // to explore cheap (cost discovery) and premium (quality discovery) alike.
    //
    // Pool for medium: [openai/cheap, openai/balanced, openai/premium, anthropic/cheap, ...]
    // (2 providers × 3 tiers = 6 entries)
    const engine = new StrategyEngine(1);
    mockGetAllStats.mockResolvedValue([makeStat('openai', 'balanced')]);

    const capturedTiers: string[] = [];
    mockResolveExplicit.mockImplementation((_name: string, tier: string) => {
      capturedTiers.push(tier);
      return MOCK_RESOLVED_MODEL;
    });

    const randomSpy = jest.spyOn(Math, 'random');
    const poolSize = 6; // 2 providers × 3 tiers
    for (let i = 0; i < poolSize; i++) {
      randomSpy.mockReturnValue(i / poolSize);
      await engine.choose('math', 'medium');
    }
    randomSpy.mockRestore();

    // All three tiers must appear in the explored set
    expect(capturedTiers).toContain('cheap');
    expect(capturedTiers).toContain('balanced');
    expect(capturedTiers).toContain('premium');
  });

  it('returns explored:true when exploration fires', async () => {
    // Why: the strategyMode audit field in RouteResponse must accurately
    // reflect what happened. Misreporting exploitation as exploration (or
    // vice versa) makes the Insights panel show wrong information.
    mockGetAllStats.mockResolvedValue([makeStat('openai', 'balanced')]);
    jest.spyOn(Math, 'random').mockReturnValue(0); // always < epsilon → always explore

    const engine   = new StrategyEngine(1);
    const decision = await engine.choose('coding', 'medium');

    expect(decision.explored).toBe(true);
    expect(decision.usedFallback).toBe(false);

    jest.restoreAllMocks();
  });

});
