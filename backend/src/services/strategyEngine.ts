import type { TaskDomain, TaskComplexity, ModelTier } from '../providers/types';
import type { ResolvedModel } from '../providers/providerManager';
import { providerManager } from '../providers';
import { performanceStore, type PerformanceStats } from './performanceStore';

// ---------------------------------------------------------------------------
// Normalisation bounds
//
// Each metric is divided by its maximum before scoring so that all inputs
// are in [0, 1] and weights have consistent meaning regardless of unit scales.
// Adjust these constants if real-world costs or latencies exceed these ceilings.
// ---------------------------------------------------------------------------

/** Maximum expected cost per API call in USD. Calls above this clamp to 1. */
const MAX_COST_USD   = 0.10;
/** Maximum expected latency in ms. Calls above this clamp to 1. */
const MAX_LATENCY_MS = 5_000;

// Tiers valid for exploration at each complexity level.
// Prevents exploration from routing a high-complexity task to 'cheap' tier.
const EXPLORATION_TIERS: Record<TaskComplexity, readonly ModelTier[]> = {
  low:    ['cheap', 'balanced'],
  medium: ['cheap', 'balanced', 'premium'],
  high:   ['balanced', 'premium'],
};

export interface TaskWeights {
  confidenceWeight: number;
  costWeight: number;
  latencyWeight: number;
  escalationWeight: number;
}

export type OptimizationMode = 'cost' | 'quality' | 'balanced';

export interface WeightOverrideConfig {
  optimizationMode?: OptimizationMode;
  customWeights?: Partial<TaskWeights>;
}

// Default weights per task domain.
//
// All metrics are normalised to [0, 1] before scoring (see scoreStats), so
// these weights are directly comparable to each other — a weight of 2.0
// means "twice as important" relative to a weight of 1.0.
export const DEFAULT_TASK_WEIGHTS: Readonly<Record<TaskDomain, TaskWeights>> = {
  coding: {
    confidenceWeight: 2.0,  // correctness matters most
    costWeight:       2.5,  // raised: providers return equal confidence, so cost must differentiate
    latencyWeight:    0.5,
    escalationWeight: 1.5,
  },
  math: {
    confidenceWeight: 2.5,  // accuracy is critical; escalation strongly penalised
    costWeight:       2.5,  // raised: prevents premium lock-in when cheaper models succeed equally
    latencyWeight:    0.5,
    escalationWeight: 2.0,
  },
  creative: {
    confidenceWeight: 1.0,
    costWeight:       3.0,  // raised: creative tasks have lowest correctness bar, most cost-sensitive
    latencyWeight:    0.3,
    escalationWeight: 0.8,
  },
  general: {
    confidenceWeight: 1.0,
    costWeight:       2.5,  // raised: general queries should use cheapest adequate model
    latencyWeight:    1.0,
    escalationWeight: 1.0,
  },
};

// Presets applied when a per-request optimizationMode is set.
// Override specific weights — unspecified weights stay at the domain default.
const OPTIMIZATION_PRESETS: Record<Exclude<OptimizationMode, 'balanced'>, Partial<TaskWeights>> = {
  cost: {
    costWeight:       5.0,   // cost dominates
    confidenceWeight: 0.5,
    escalationWeight: 0.5,
  },
  quality: {
    confidenceWeight: 4.0,   // confidence and low escalation dominate
    escalationWeight: 3.0,
    costWeight:       0.3,
  },
};

// ---------------------------------------------------------------------------
// Weight validation
// ---------------------------------------------------------------------------

/**
 * Clamp a weight value to a safe range [0, 100].
 * Rejects non-finite values (NaN, Infinity) from request-supplied customWeights.
 * Falls back to the provided default so a bad user-supplied weight never
 * inverts the scoring function.
 */
function clampWeight(value: number, defaultValue: number): number {
  if (!isFinite(value) || value < 0) return defaultValue;
  return Math.min(value, 100);
}

// Format: CODE_WEIGHTS=confidence:2.0,cost:0.5,latency:0.2,escalation:1.0
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

const EFFECTIVE_WEIGHTS = buildEffectiveWeights();

export interface StrategyDecision {
  resolved: ResolvedModel;
  winningStats: PerformanceStats | null;
  score: number | null;
  usedFallback: boolean;
  explored: boolean;
  rankedOptions: Array<PerformanceStats & { score: number }>;
}

export class StrategyEngine {
  readonly epsilon: number;

  constructor(epsilon = 0.1) {
    this.epsilon = epsilon;
  }

  resolveWeights(taskType: TaskDomain, override?: WeightOverrideConfig): TaskWeights {
    let weights: TaskWeights = EFFECTIVE_WEIGHTS[taskType];

    const mode = override?.optimizationMode;
    if (mode && mode !== 'balanced') {
      weights = { ...weights, ...OPTIMIZATION_PRESETS[mode] };
    }

    if (override?.customWeights) {
      const cw = override.customWeights;
      // Clamp each supplied weight — negative or non-finite values would invert
      // the scoring function and produce undefined routing behaviour.
      weights = {
        confidenceWeight: cw.confidenceWeight !== undefined ? clampWeight(cw.confidenceWeight, weights.confidenceWeight) : weights.confidenceWeight,
        costWeight:       cw.costWeight       !== undefined ? clampWeight(cw.costWeight,       weights.costWeight)       : weights.costWeight,
        latencyWeight:    cw.latencyWeight    !== undefined ? clampWeight(cw.latencyWeight,    weights.latencyWeight)    : weights.latencyWeight,
        escalationWeight: cw.escalationWeight !== undefined ? clampWeight(cw.escalationWeight, weights.escalationWeight) : weights.escalationWeight,
      };
    }

    return weights;
  }

  async choose(
    taskType: TaskDomain,
    complexity: TaskComplexity,
    override?: WeightOverrideConfig,
  ): Promise<StrategyDecision> {
    const candidates = await performanceStore.getAllStats(taskType);

    if (candidates.length === 0) {
      return {
        resolved:      providerManager.resolve(taskType, complexity),
        winningStats:  null,
        score:         null,
        usedFallback:  true,
        explored:      false,
        rankedOptions: [],
      };
    }

    const weights = this.resolveWeights(taskType, override);
    const rankedOptions = candidates
      .map(s => ({ ...s, score: this.scoreStats(s, weights) }))
      .sort((a, b) => b.score - a.score);

    if (Math.random() < this.epsilon) {
      return { ...this.exploreRandom(taskType, complexity), rankedOptions };
    }

    return { ...this.exploit(candidates, weights), rankedOptions };
  }

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

  private exploreRandom(taskType: TaskDomain, complexity: TaskComplexity): Omit<StrategyDecision, 'rankedOptions'> {
    const providers = providerManager.listProviders();
    // Constrain exploration to tiers appropriate for the task complexity.
    // Without this, a high-complexity prompt could be routed to 'cheap' tier
    // during exploration, giving the user a degraded response.
    const validTiers = EXPLORATION_TIERS[complexity];

    const pool: { providerName: string; tier: ModelTier }[] = [];
    for (const p of providers) {
      for (const tier of validTiers) {
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

  private scoreStats(stats: PerformanceStats, weights: TaskWeights): number {
    // Each metric is normalised to [0, 1] before applying weights so that
    // weights are dimensionless and directly comparable to one another.
    // Without normalisation, raw unit differences (ms vs USD vs fraction)
    // make the weight magnitudes meaningless and fragile to scale changes.
    const normCost    = Math.min(stats.averageCostUsd   / MAX_COST_USD,    1);
    const normLatency = Math.min(stats.averageLatencyMs / MAX_LATENCY_MS,  1);
    // averageConfidence and escalationRate are already in [0, 1].
    return (
        weights.confidenceWeight * stats.averageConfidence
      - weights.costWeight       * normCost
      - weights.latencyWeight    * normLatency
      - weights.escalationWeight * stats.escalationRate
    );
  }
}

export const strategyEngine = new StrategyEngine();
