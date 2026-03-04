/**
 * requestLog.ts
 *
 * Inserts one row into `request_logs` after every completed routing decision.
 * Always called fire-and-forget — never blocks the response.
 */

import type { TaskDomain, ModelTier } from '../providers/types';
import { getSupabaseClient } from '../lib/supabase';

export interface LogRequestParams {
  prompt:     string;
  provider:   string;
  tier:       ModelTier;
  taskType:   TaskDomain;
  latencyMs:  number;
  confidence: number;
  costUsd:    number;
  escalated:  boolean;
}

export async function logRequest(params: LogRequestParams): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('request_logs')
    .insert({
      prompt:     params.prompt,
      provider:   params.provider,
      tier:       params.tier,
      task_type:  params.taskType,
      latency_ms: params.latencyMs,
      confidence: params.confidence,
      cost_usd:   params.costUsd,
      escalated:  params.escalated,
    });

  if (error) {
    throw new Error(`requestLog.logRequest failed: ${error.message}`);
  }
}
