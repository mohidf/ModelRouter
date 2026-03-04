/**
 * performanceStore.ts
 *
 * Persistent performance tracking backed by Supabase (PostgreSQL).
 *
 * Each row in the `performance_stats` table represents a unique
 * (provider, tier, taskType) bucket.  Rolling averages are maintained
 * atomically in the database via the `record_performance` PL/pgSQL RPC,
 * which applies the formula:
 *
 *   newAvg = (oldAvg * totalRequests + newValue) / (totalRequests + 1)
 *
 * All public methods are async. Callers that don't need to await the write
 * (e.g. hot-path routing) should fire-and-forget with a `.catch()` handler.
 */

import type { TaskDomain, ModelTier } from '../providers/types';
import { getSupabaseClient } from '../lib/supabase';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Public types (unchanged from in-memory version — same interface)
// ---------------------------------------------------------------------------

export interface RecordResultParams {
  provider:   string;
  tier:       ModelTier;
  taskType:   TaskDomain;
  latencyMs:  number;
  /** 0–1: model-reported or tier-simulated confidence in response quality. */
  confidence: number;
  /** True when this call's confidence fell below threshold, triggering escalation. */
  escalated:  boolean;
  costUsd:    number;
}

export interface PerformanceStats {
  provider:          string;
  tier:              ModelTier;
  taskType:          TaskDomain;
  totalRequests:     number;
  averageLatencyMs:  number;
  averageConfidence: number;
  /** Fraction of calls that triggered escalation (0–1). */
  escalationRate:    number;
  averageCostUsd:    number;
}

export interface BestOptionResult {
  stats: PerformanceStats;
  /** Composite score used for ranking — higher is better. */
  score: number;
}

// ---------------------------------------------------------------------------
// DB row shape returned by Supabase
// ---------------------------------------------------------------------------

interface DbRow {
  provider:        string;
  tier:            string;
  task_type:       string;
  total_requests:  number;
  avg_latency_ms:  number;
  avg_confidence:  number;
  escalation_rate: number;
  avg_cost_usd:    number;
}

// ---------------------------------------------------------------------------
// PerformanceStore
// ---------------------------------------------------------------------------

export class PerformanceStore {

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Record the outcome of a single provider call.
   *
   * Calls the `record_performance` PL/pgSQL RPC which atomically upserts
   * rolling averages in Supabase — concurrency-safe at the row level.
   *
   * Call once for the initial model and, if escalation occurred, once more
   * for the final model (with escalated: false for that second call).
   */
  async recordResult(params: RecordResultParams): Promise<void> {
    const { provider, tier, taskType, latencyMs, confidence, escalated, costUsd } = params;

    const { error } = await getSupabaseClient().rpc('record_performance', {
      p_provider:   provider,
      p_tier:       tier,
      p_task_type:  taskType,
      p_latency_ms: latencyMs,
      p_confidence: confidence,
      p_escalated:  escalated,
      p_cost_usd:   costUsd,
      p_alpha:      config.emaAlpha,
    });

    if (error) {
      throw new Error(`PerformanceStore.recordResult failed: ${error.message}`);
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Return computed stats for a specific (provider, tier, taskType) triple.
   * Returns null if no data has been recorded for this combination yet.
   */
  async getStats(
    provider: string,
    tier:     ModelTier,
    taskType: TaskDomain,
  ): Promise<PerformanceStats | null> {
    const { data, error } = await getSupabaseClient()
      .from('performance_stats')
      .select('*')
      .eq('provider',  provider)
      .eq('tier',      tier)
      .eq('task_type', taskType)
      .maybeSingle();

    if (error) throw new Error(`PerformanceStore.getStats failed: ${error.message}`);
    return data ? this.toStats(data as DbRow) : null;
  }

  /**
   * Return computed stats for every recorded bucket, optionally filtered
   * by taskType. Rows with zero requests are never inserted, so every
   * returned entry has at least one data point.
   */
  async getAllStats(taskType?: TaskDomain): Promise<PerformanceStats[]> {
    let query = getSupabaseClient()
      .from('performance_stats')
      .select('*');

    if (taskType !== undefined) {
      query = query.eq('task_type', taskType);
    }

    const { data, error } = await query;
    if (error) throw new Error(`PerformanceStore.getAllStats failed: ${error.message}`);

    return (data as DbRow[]).map(row => this.toStats(row));
  }

  /**
   * Return the highest-scoring (provider, tier) combination for the given
   * taskType, based on observed performance data.
   *
   * Scoring formula (higher is better, max ≈ 100):
   *   confidence  × 50  (0–50 pts) — primary driver: response quality
   *   (1 – escalationRate) × 30    — low escalation signals consistent quality
   *   10 – (avgLatencyMs  / 200)   — latency penalty, clamped ≥ 0
   *   10 – (avgCostUsd × 1000)     — cost penalty, clamped ≥ 0
   *
   * Returns null when no data exists for the given taskType.
   */
  async getBestOption(taskType: TaskDomain): Promise<BestOptionResult | null> {
    const candidates = await this.getAllStats(taskType);
    if (candidates.length === 0) return null;

    let best: BestOptionResult | null = null;
    for (const stats of candidates) {
      const score = this.computeScore(stats);
      if (best === null || score > best.score) {
        best = { stats, score };
      }
    }

    return best;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private toStats(row: DbRow): PerformanceStats {
    return {
      provider:          row.provider,
      tier:              row.tier as ModelTier,
      taskType:          row.task_type as TaskDomain,
      totalRequests:     row.total_requests,
      averageLatencyMs:  row.avg_latency_ms,
      averageConfidence: row.avg_confidence,
      escalationRate:    row.escalation_rate,
      averageCostUsd:    row.avg_cost_usd,
    };
  }

  private computeScore(stats: PerformanceStats): number {
    const confidenceScore = stats.averageConfidence * 50;
    const escalationScore = (1 - stats.escalationRate) * 30;
    const latencyScore    = Math.max(0, 10 - stats.averageLatencyMs / 200);
    const costScore       = Math.max(0, 10 - stats.averageCostUsd * 1000);
    return confidenceScore + escalationScore + latencyScore + costScore;
  }
}

export const performanceStore = new PerformanceStore();
