import type { TaskDomain, TaskComplexity, ModelTier } from '../providers/types';
import type { ResolvedModel } from '../providers/providerManager';
import { providerManager } from '../providers';
import { performanceStore, type PerformanceStats } from './performanceStore';
import { MODEL_REGISTRY } from '../config/models';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Normalisation bounds
//
// Each metric is divided by its maximum before scoring so that all inputs
// are in [0, 1] and weights have consistent meaning regardless of unit scales.
// Adjust these constants if real-world costs or latencies exceed these ceilings.
// ---------------------------------------------------------------------------

/**
 * Maximum expected cost per API call in USD used for normalisation.
 * Real-world ranges: cheap $0.0001–$0.001, balanced $0.005–$0.015,
 * premium $0.015–$0.05. A ceiling of $0.20 ensures no real-world call
 * is clamped to 1.0, preserving meaningful score separation across tiers.
 * Calls above this clamp to 1 (worst possible cost penalty).
 */
const MAX_COST_USD   = 0.20;

/**
 * Maximum expected latency in ms used for normalisation.
 * In practice models range 500ms–20000ms. A ceiling of 30 000ms ensures
 * that a 10 000ms model is not treated identically to a 6 000ms one —
 * both stay well below the clamp and retain proportional penalties.
 * Calls above this clamp to 1 (worst possible latency penalty).
 */
const MAX_LATENCY_MS = 30_000;

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
    costWeight:       3.0,  // cost differentiates when all providers return equal confidence
    latencyWeight:    0.5,
    escalationWeight: 0.8,  // reduced: escalation reflects classifier ambiguity, not model quality
  },
  coding_debug: {
    confidenceWeight: 3.0,  // highest correctness bar — wrong debug advice wastes dev time
    costWeight:       2.0,
    latencyWeight:    0.5,
    escalationWeight: 1.0,
  },
  math: {
    confidenceWeight: 2.5,  // accuracy is critical
    costWeight:       3.0,
    latencyWeight:    0.5,
    escalationWeight: 0.8,
  },
  math_reasoning: {
    confidenceWeight: 3.0,  // chain-of-thought correctness is paramount
    costWeight:       2.5,
    latencyWeight:    0.5,
    escalationWeight: 1.0,
  },
  creative: {
    confidenceWeight: 1.0,
    costWeight:       4.0,  // creative tasks have lowest correctness bar, most cost-sensitive
    latencyWeight:    0.3,
    // Low escalation penalty: escalation here reflects low classifier confidence,
    // not poor model output quality — don't double-punish cheap models for it.
    escalationWeight: 0.2,
  },
  research: {
    confidenceWeight: 2.0,  // factual accuracy over cost
    costWeight:       1.5,
    latencyWeight:    0.5,
    escalationWeight: 1.5,
  },
  summarization: {
    confidenceWeight: 1.0,  // any capable model can summarize — optimize for cost
    costWeight:       4.5,
    latencyWeight:    0.5,
    escalationWeight: 0.2,  // same rationale as creative — don't penalize cheap models
  },
  vision: {
    confidenceWeight: 2.5,  // quality matters — only certain models support vision
    costWeight:       1.5,
    latencyWeight:    1.0,
    escalationWeight: 2.0,
  },
  general: {
    confidenceWeight: 1.0,
    costWeight:       4.0,  // general queries should use cheapest adequate model
    latencyWeight:    1.0,
    // Escalation on general queries reflects ambiguous phrasing, not model failure.
    escalationWeight: 0.2,
  },
  general_chat: {
    confidenceWeight: 0.8,  // speed and cost dominate for chitchat
    costWeight:       4.5,
    latencyWeight:    1.5,
    escalationWeight: 0.2,  // chitchat escalation is nearly always classifier noise
  },
  multilingual: {
    confidenceWeight: 2.0,  // translation quality matters
    costWeight:       2.5,
    latencyWeight:    0.8,
    escalationWeight: 0.5,
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
    coding:        process.env.CODE_WEIGHTS,
    coding_debug:  process.env.CODING_DEBUG_WEIGHTS,
    math:          process.env.MATH_WEIGHTS,
    math_reasoning: process.env.MATH_REASONING_WEIGHTS,
    creative:      process.env.CREATIVE_WEIGHTS,
    research:      process.env.RESEARCH_WEIGHTS,
    summarization: process.env.SUMMARIZATION_WEIGHTS,
    vision:        process.env.VISION_WEIGHTS,
    general:       process.env.GENERAL_WEIGHTS,
    general_chat:  process.env.GENERAL_CHAT_WEIGHTS,
    multilingual:  process.env.MULTILINGUAL_WEIGHTS,
  };
  const result = Object.fromEntries(
    Object.entries(DEFAULT_TASK_WEIGHTS).map(([k, v]) => [k, { ...v }]),
  ) as Record<TaskDomain, TaskWeights>;
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
    let candidates: PerformanceStats[];
    try {
      candidates = await performanceStore.getAllStats(taskType);
    } catch (err) {
      logger.warn('StrategyEngine.choose: performance store unavailable, using static routing fallback', {
        taskType, error: err instanceof Error ? err.message : String(err),
      });
      return {
        resolved:      providerManager.resolve(taskType, complexity),
        winningStats:  null,
        score:         null,
        usedFallback:  true,
        explored:      false,
        rankedOptions: [],
      };
    }

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
      .sort((a, b) => {
        const diff = b.score - a.score;
        // Break ties (within floating-point noise) by preferring lower cost,
        // then lower latency — prevents DB insertion order from deciding.
        if (Math.abs(diff) > 1e-6) return diff;
        const costDiff = a.averageCostUsd - b.averageCostUsd;
        if (Math.abs(costDiff) > 1e-9) return costDiff;
        return a.averageLatencyMs - b.averageLatencyMs;
      });

    if (Math.random() < this.epsilon) {
      return { ...this.exploreRandom(taskType, complexity), rankedOptions };
    }

    return { ...this.exploit(candidates, weights, taskType, complexity), rankedOptions };
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
    // Build exploration pool from model registry, constrained to tiers valid
    // for the task complexity. This gives per-model granularity during exploration
    // instead of per-(provider, tier) pairs.
    const validTiers = EXPLORATION_TIERS[complexity];
    const pool = MODEL_REGISTRY.filter(m => (validTiers as readonly ModelTier[]).includes(m.tier));

    // Guard: if no models match the tier constraint (misconfigured registry),
    // fall back to the default routing decision rather than crashing on
    // an undefined index access.
    if (pool.length === 0) {
      return {
        resolved:     providerManager.resolve(taskType, complexity),
        winningStats: null,
        score:        null,
        usedFallback: true,
        explored:     false,
      };
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const resolved = providerManager.resolveByModelId(
      pick.id,
      `Exploration (ε=${this.epsilon}): ${pick.displayName} (${pick.tier}) for ${taskType}`,
    );

    return { resolved, winningStats: null, score: null, usedFallback: false, explored: true };
  }

  private exploit(
    candidates:  PerformanceStats[],
    weights:     TaskWeights,
    taskType:    TaskDomain,
    complexity:  TaskComplexity,
  ): Omit<StrategyDecision, 'rankedOptions'> {
    // Sort descending by score so we try the best candidate first.
    const ranked = [...candidates]
      .map(s => ({ stats: s, score: this.scoreStats(s, weights) }))
      .sort((a, b) => {
        const diff = b.score - a.score;
        if (Math.abs(diff) > 1e-6) return diff;
        const costDiff = a.stats.averageCostUsd - b.stats.averageCostUsd;
        if (Math.abs(costDiff) > 1e-9) return costDiff;
        return a.stats.averageLatencyMs - b.stats.averageLatencyMs;
      });

    for (const { stats: w, score: bestScore } of ranked) {
      try {
        const resolved = providerManager.resolveByModelId(
          w.modelId,
          `Strategy: ${w.modelId} scored ${bestScore.toFixed(3)} ` +
          `(conf ${(w.averageConfidence * 100).toFixed(0)}%, ` +
          `esc ${(w.escalationRate * 100).toFixed(0)}%, ` +
          `${Math.round(w.averageLatencyMs)} ms, ` +
          `$${w.averageCostUsd.toFixed(6)})`,
        );
        return { resolved, winningStats: w, score: bestScore, usedFallback: false, explored: false };
      } catch {
        // Model ID is stale (removed from registry or provider no longer registered).
        // Log once and try the next-best candidate rather than surfacing a 500.
        logger.warn('StrategyEngine.exploit: skipping stale model ID', {
          modelId: w.modelId, taskType,
        });
      }
    }

    // All performance candidates are stale — fall back to static routing.
    logger.warn('StrategyEngine.exploit: all candidates stale, using static routing fallback', { taskType });
    return {
      resolved:     providerManager.resolve(taskType, complexity),
      winningStats: null,
      score:        null,
      usedFallback: true,
      explored:     false,
    };
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
