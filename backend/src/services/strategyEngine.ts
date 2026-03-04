/**
 * strategyEngine.ts
 *
 * Data-driven model selection with epsilon-greedy exploration.
 *
 * Given a (taskType, complexity), the engine:
 *   1. Falls back to providerManager.resolve() when no historical data exists.
 *   2. With probability epsilon, picks a random (provider, tier) — exploration.
 *   3. Otherwise, scores every recorded bucket and picks the highest — exploitation.
 *
 * Scoring formula (higher is better):
 *
 *   score = (confidenceWeight  × avgConfidence)
 *         - (costWeight        × avgCostUsd)
 *         - (latencyWeight     × avgLatencyMs)
 *         - (escalationWeight  × escalationRate)
 *
 * Weight resolution order (each step overrides the previous):
 *   1. Per-domain defaults  (DEFAULT_TASK_WEIGHTS)
 *   2. Environment variable overrides  (CODE_WEIGHTS, MATH_WEIGHTS, etc.)
 *   3. Per-request optimization mode preset  ('cost' | 'quality')
 *   4. Per-request custom weights
 */

import type { TaskDomain, TaskComplexity, ModelTier } from '../providers/types';
import type { ResolvedModel } from '../providers/providerManager';
import { providerManager } from '../providers';
import { performanceStore, type PerformanceStats } from './performanceStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'premium'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskWeights {
  /** Reward per unit of average confidence (range 0–1). */
  confidenceWeight: number;
  /** Penalty per USD of average cost per call. */
  costWeight: number;
  /** Penalty per millisecond of average latency. */
  latencyWeight: number;
  /** Penalty per unit of escalation rate (range 0–1). */
  escalationWeight: number;
}

export type OptimizationMode = 'cost' | 'quality' | 'balanced';

export interface WeightOverrideConfig {
  optimizationMode?: OptimizationMode;
  customWeights?: Partial<TaskWeights>;
}

// ---------------------------------------------------------------------------
// Per-domain default weights
// ---------------------------------------------------------------------------

export const DEFAULT_TASK_WEIGHTS: Readonly<Record<TaskDomain, TaskWeights>> = {
  coding: {
    confidenceWeight: 1.5,   // Code quality matters
    costWeight:       8.0,
    latencyWeight:    0.001,
    escalationWeight: 1.2,   // Re-runs are costly
  },
  math: {
    confidenceWeight: 2.0,   // Correctness is critical
    costWeight:       8.0,
    latencyWeight:    0.001,
    escalationWeight: 2.0,   // Strong penalty for wrong answers requiring retry
  },
  creative: {
    confidenceWeight: 1.0,
    costWeight:       12.0,  // Cost-sensitive — typically volume tasks
    latencyWeight:    0.0005, // Latency matters less for creative
    escalationWeight: 0.8,
  },
  general: {
    confidenceWeight: 1.0,
    costWeight:       10.0,
    latencyWeight:    0.001,
    escalationWeight: 1.0,
  },
};

// ---------------------------------------------------------------------------
// Optimization mode presets
// Applied on top of domain defaults when a per-request mode is specified.
// ---------------------------------------------------------------------------

const OPTIMIZATION_PRESETS: Record<Exclude<OptimizationMode, 'balanced'>, Partial<TaskWeights>> = {
  cost: {
    confidenceWeight: 0.8,
    costWeight:       20.0,
    latencyWeight:    0.0005,
    escalationWeight: 0.8,
  },
  quality: {
    confidenceWeight: 2.0,
    costWeight:       5.0,
    latencyWeight:    0.001,
    escalationWeight: 2.0,
  },
};

// ---------------------------------------------------------------------------
// Environment variable parsing
// Format: CODE_WEIGHTS=confidence:2.0,cost:0.5,latency:0.2,escalation:1.0
// ---------------------------------------------------------------------------

function parseWeightsEnv(envVar: string | undefined): Partial<TaskWeights> | null {
  if (!envVar) return null;
  const result: Partial<TaskWeights> = {};
  for (const part of envVar.split(',')) {
    const [key, val] = part.trim().split(':');
    const num = parseFloat(val ?? '');
    if (!isFinite(num) || num < 0) continue;
    if (key === 'confidence') result.confidenceWeight = num;
    if (key === 'cost')       result.costWeight       = num;
    if (key === 'latency')    result.latencyWeight    = num;
    if (key === 'escalation') result.escalationWeight = num;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function buildEffectiveWeights(): Record<TaskDomain, TaskWeights> {
  const envMap: Record<TaskDomain, string | undefined> = {
    coding:   process.env.CODE_WEIGHTS,
    math:     process.env.MATH_WEIGHTS,
    creative: process.env.CREATIVE_WEIGHTS,
    general:  process.env.GENERAL_WEIGHTS,
  };
  const result: Record<TaskDomain, TaskWeights> = {
    coding:   { ...DEFAULT_TASK_WEIGHTS.coding },
    math:     { ...DEFAULT_TASK_WEIGHTS.math },
    creative: { ...DEFAULT_TASK_WEIGHTS.creative },
    general:  { ...DEFAULT_TASK_WEIGHTS.general },
  };
  for (const [domain, envVal] of Object.entries(envMap) as [TaskDomain, string | undefined][]) {
    const overrides = parseWeightsEnv(envVal);
    if (overrides) result[domain] = { ...result[domain], ...overrides };
  }
  return result;
}

// Computed once at module load (domain defaults + env var overrides)
const EFFECTIVE_WEIGHTS = buildEffectiveWeights();

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface StrategyDecision {
  /** The resolved model ready to pass to providerManager.dispatch(). */
  resolved: ResolvedModel;
  /** The winning performance bucket. Null when exploration or fallback was used. */
  winningStats: PerformanceStats | null;
  /** Exploitation score of the winning bucket. Null when exploration or fallback was used. */
  score: number | null;
  /** True when no historical data was available — default routing used. */
  usedFallback: boolean;
  /** True when the result was chosen by random exploration rather than best-score. */
  explored: boolean;
  /** All scored candidates for this taskType, sorted best-first. Empty during fallback. */
  rankedOptions: Array<PerformanceStats & { score: number }>;
}

// ---------------------------------------------------------------------------
// StrategyEngine
// ---------------------------------------------------------------------------

export class StrategyEngine {
  /**
   * Epsilon-greedy exploration probability (range 0–1).
   * At each call, a uniform random draw is taken:
   *   < epsilon  → explore: pick a random registered (provider, tier)
   *   ≥ epsilon  → exploit: pick the highest-scoring bucket
   * Only active when historical data exists; ignored during fallback.
   */
  readonly epsilon: number;

  constructor(epsilon = 0.1) {
    this.epsilon = epsilon;
  }

  // ── Weight resolution ──────────────────────────────────────────────────────

  /**
   * Resolve the effective weights for a task type.
   *
   * Resolution order (later overrides earlier):
   *   domain defaults → env var overrides (applied at startup) →
   *   optimization mode preset → custom weights from request
   */
  resolveWeights(taskType: TaskDomain, override?: WeightOverrideConfig): TaskWeights {
    let weights: TaskWeights = EFFECTIVE_WEIGHTS[taskType];

    const mode = override?.optimizationMode;
    if (mode && mode !== 'balanced') {
      weights = { ...weights, ...OPTIMIZATION_PRESETS[mode] };
    }

    if (override?.customWeights) {
      weights = { ...weights, ...override.customWeights };
    }

    return weights;
  }

  // ── Core selection ─────────────────────────────────────────────────────────

  /**
   * Choose a (provider, tier) for the given (taskType, complexity).
   *
   * Decision order:
   *   1. No historical data          → fallback (providerManager.resolve)
   *   2. Math.random() < epsilon     → explore  (random registered option)
   *   3. Otherwise                   → exploit  (highest-scoring bucket)
   */
  async choose(
    taskType: TaskDomain,
    complexity: TaskComplexity,
    override?: WeightOverrideConfig,
  ): Promise<StrategyDecision> {
    const candidates = await performanceStore.getAllStats(taskType);

    if (candidates.length === 0) {
      return {
        resolved:     providerManager.resolve(taskType, complexity),
        winningStats: null,
        score:        null,
        usedFallback: true,
        explored:     false,
        rankedOptions: [],
      };
    }

    const weights = this.resolveWeights(taskType, override);
    const rankedOptions = candidates
      .map(s => ({ ...s, score: this.scoreStats(s, weights) }))
      .sort((a, b) => b.score - a.score);

    if (Math.random() < this.epsilon) {
      return { ...this.exploreRandom(taskType), rankedOptions };
    }

    return { ...this.exploit(candidates, weights), rankedOptions };
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  /**
   * Return all performance buckets for a taskType, each annotated with its
   * exploitation score, sorted best-first.
   *
   * Used by the /performance endpoint to produce ranked comparisons.
   */
  async rankStats(
    taskType: TaskDomain,
    override?: WeightOverrideConfig,
  ): Promise<Array<PerformanceStats & { score: number }>> {
    const stats = await performanceStore.getAllStats(taskType);
    const weights = this.resolveWeights(taskType, override);
    return stats
      .map(s => ({ ...s, score: this.scoreStats(s, weights) }))
      .sort((a, b) => b.score - a.score);
  }

  // ── Private: exploration ───────────────────────────────────────────────────

  private exploreRandom(taskType: TaskDomain): Omit<StrategyDecision, 'rankedOptions'> {
    const providers = providerManager.listProviders();

    const pool: { providerName: string; tier: ModelTier }[] = [];
    for (const p of providers) {
      for (const tier of ALL_TIERS) {
        pool.push({ providerName: p.name, tier });
      }
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const resolved = providerManager.resolveExplicit(
      pick.providerName,
      pick.tier,
      `Exploration (ε=${this.epsilon}): random ${pick.providerName}/${pick.tier} for ${taskType}`,
    );

    return { resolved, winningStats: null, score: null, usedFallback: false, explored: true };
  }

  // ── Private: exploitation ──────────────────────────────────────────────────

  private exploit(candidates: PerformanceStats[], weights: TaskWeights): Omit<StrategyDecision, 'rankedOptions'> {
    let winner:    PerformanceStats | null = null;
    let bestScore  = -Infinity;

    for (const stats of candidates) {
      const s = this.scoreStats(stats, weights);
      if (s > bestScore) {
        bestScore = s;
        winner    = stats;
      }
    }

    const w = winner!;
    const resolved = providerManager.resolveExplicit(
      w.provider,
      w.tier,
      `Strategy: ${w.provider}/${w.tier} scored ${bestScore.toFixed(3)} ` +
      `(conf ${(w.averageConfidence * 100).toFixed(0)}%, ` +
      `esc ${(w.escalationRate * 100).toFixed(0)}%, ` +
      `${Math.round(w.averageLatencyMs)} ms, ` +
      `$${w.averageCostUsd.toFixed(6)})`,
    );

    return { resolved, winningStats: w, score: bestScore, usedFallback: false, explored: false };
  }

  // ── Private: scoring ───────────────────────────────────────────────────────

  private scoreStats(stats: PerformanceStats, weights: TaskWeights): number {
    return (
        weights.confidenceWeight * stats.averageConfidence
      - weights.costWeight       * stats.averageCostUsd
      - weights.latencyWeight    * stats.averageLatencyMs
      - weights.escalationWeight * stats.escalationRate
    );
  }
}

export const strategyEngine = new StrategyEngine();
