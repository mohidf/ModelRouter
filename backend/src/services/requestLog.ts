/**
 * requestLog.ts
 *
 * Inserts one row into `request_logs` after every completed routing decision.
 * Always called fire-and-forget — never blocks the response.
 *
 * Privacy: raw prompt text is NEVER persisted. We store a SHA-256 hash of
 * the prompt plus its character length. The hash is a one-way fingerprint —
 * identical prompts are detectable for dedup/analytics, but the content
 * cannot be recovered from it. This eliminates persistent PII/secret exposure
 * from database access, backups, or log exports.
 *
 * If you need to correlate a specific prompt with a log entry, hash the
 * prompt client-side with SHA-256 and match against `prompt_hash`.
 */

import { createHash } from 'crypto';
import type { TaskDomain, ModelTier } from '../providers/types';
import { getSupabaseClient } from '../lib/supabase';

export interface LogRequestParams {
  prompt:     string;
  /** Canonical model ID (e.g. "meta-llama/Llama-3.3-70B-Instruct"). */
  modelId:    string;
  provider:   string;
  tier:       ModelTier;
  taskType:   TaskDomain;
  latencyMs:  number;
  confidence: number;
  costUsd:    number;
  escalated:  boolean;
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

export async function logRequest(params: LogRequestParams): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('request_logs')
    .insert({
      prompt_hash:   hashPrompt(params.prompt),
      prompt_length: params.prompt.length,
      model_id:      params.modelId,
      provider:      params.provider,
      tier:          params.tier,
      task_type:     params.taskType,
      latency_ms:    params.latencyMs,
      confidence:    params.confidence,
      cost_usd:      params.costUsd,
      escalated:     params.escalated,
    });

  if (error) {
    throw new Error(`requestLog.logRequest failed: ${error.message}`);
  }
}
