/**
 * performanceStore.ts
 *
 * Persistent performance tracking backed by Supabase (PostgreSQL).
 *
 * Each row in the `performance_stats` table represents a unique
 * (model_id, task_type) bucket. Rolling averages are maintained
 * atomically in the database via the `record_performance` PL/pgSQL RPC.
 * The RPC receives `p_alpha` (EMA smoothing factor from config.emaAlpha)
 * and applies it to update the stored averages — refer to the RPC source
 * for the exact formula.
 *
 * All public methods are async. Callers that don't need to await the write
 * (e.g. hot-path routing) should fire-and-forget with a `.catch()` handler.
 *
 * Scoring: do NOT add a scoring function here. StrategyEngine owns scoring
 * (strategyEngine.scoreStats / strategyEngine.rankStats). Duplicating it with
 * different weights causes the UI and the router to disagree on which
 * provider is "best".
 */

import type { TaskDomain, ModelTier } from '../providers/types';
import { getSupabaseClient } from '../lib/supabase';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Public types (unchanged from in-memory version — same interface)
// ---------------------------------------------------------------------------

export interface RecordResultParams {
  /** Canonical model ID (e.g. "meta-llama/Llama-3.3-70B-Instruct"). Primary key. */
  modelId:    string;
  /** Provider name — stored denormalized for display queries. */
  provider:   string;
  /** Capability tier — stored denormalized for display queries. */
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
  /** Canonical model ID — primary key dimension replacing (provider, tier). */
  modelId:           string;
  /** Provider name — kept for display and fallback resolution. */
  provider:          string;
  /** Capability tier — kept for display and exploration constraints. */
  tier:              ModelTier;
  taskType:          TaskDomain;
  totalRequests:     number;
  averageLatencyMs:  number;
  averageConfidence: number;
  /** Fraction of calls that triggered escalation (0–1). */
  escalationRate:    number;
  averageCostUsd:    number;
}

// ---------------------------------------------------------------------------
// DB row shape returned by Supabase
// ---------------------------------------------------------------------------

interface DbRow {
  model_id:        string;
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
    const { modelId, provider, tier, taskType, latencyMs, confidence, escalated, costUsd } = params;

    const { error } = await getSupabaseClient().rpc('record_performance', {
      p_model_id:   modelId,
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
   * Return computed stats for a specific (modelId, taskType) pair.
   * Returns null if no data has been recorded for this combination yet.
   */
  async getStats(
    modelId:  string,
    taskType: TaskDomain,
  ): Promise<PerformanceStats | null> {
    const { data, error } = await getSupabaseClient()
      .from('performance_stats')
      .select('*')
      .eq('model_id',  modelId)
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

  // ── Private helpers ───────────────────────────────────────────────────────

  private toStats(row: DbRow): PerformanceStats {
    return {
      modelId:           row.model_id,
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

}

export const performanceStore = new PerformanceStore();
