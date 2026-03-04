import type { TaskDomain, TaskComplexity, ModelTier } from '../providers/types';
import type { ResolvedModel } from '../providers/providerManager';
import { providerManager } from '../providers';
import { performanceStore, type PerformanceStats } from './performanceStore';

const ALL_TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'premium'];

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

// Default weights per task domain
export const DEFAULT_TASK_WEIGHTS: Readonly<Record<TaskDomain, TaskWeights>> = {
  coding: {
    confidenceWeight: 1.5,
    costWeight:       8.0,
    latencyWeight:    0.001,
    escalationWeight: 1.2,
  },
  math: {
    confidenceWeight: 2.0,
    costWeight:       8.0,
    latencyWeight:    0.001,
    escalationWeight: 2.0,
  },
  creative: {
    confidenceWeight: 1.0,
    costWeight:       12.0,
    latencyWeight:    0.0005,
    escalationWeight: 0.8,
  },
  general: {
    confidenceWeight: 1.0,
    costWeight:       10.0,
    latencyWeight:    0.001,
    escalationWeight: 1.0,
  },
};

// Presets applied when a per-request optimizationMode is set
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
      weights = { ...weights, ...override.customWeights };
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
      return { ...this.exploreRandom(taskType), rankedOptions };
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
    return (
        weights.confidenceWeight * stats.averageConfidence
      - weights.costWeight       * stats.averageCostUsd
      - weights.latencyWeight    * stats.averageLatencyMs
      - weights.escalationWeight * stats.escalationRate
    );
  }
}

export const strategyEngine = new StrategyEngine();
