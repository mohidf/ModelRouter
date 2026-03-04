/**
 * baseProvider.ts
 *
 * Defines the contract every AI provider must satisfy.
 * Nothing outside providers/ should import concrete provider classes —
 * depend only on IProvider and the types defined here.
 */

import type { ModelTier } from './types';

// ---------------------------------------------------------------------------
// Call options
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Maximum tokens the model may produce. */
  maxTokens: number;
  /**
   * Capability tier requested for this call.
   * Providers use this to drive latency, response depth, and confidence
   * simulation — never infer tier from the model string.
   */
  tier: ModelTier;
}

// ---------------------------------------------------------------------------
// Call result
// ---------------------------------------------------------------------------

export interface GenerateResult {
  /** Raw text returned by the model. */
  text: string;
  /** Input tokens consumed (from the API or estimated). */
  inputTokens: number;
  /** Output tokens produced (from the API or estimated). */
  outputTokens: number;
  /** Wall-clock latency of the provider call in milliseconds. */
  latencyMs: number;
  /** Canonical model identifier (e.g. "gpt-4o", "claude-opus-4-6"). */
  model: string;
  /** Provider name (e.g. "openai", "anthropic"). */
  provider: string;
  /** Tier used for this call — echoed from GenerateOptions. */
  tier: ModelTier;
  /**
   * Simulated confidence in this model's response quality (0–1).
   * Derived from tier characteristics; premium yields higher confidence.
   * Replace with a real model-reported score when using live APIs.
   */
  modelConfidence: number;
}

// ---------------------------------------------------------------------------
// Cost estimate
// ---------------------------------------------------------------------------

export interface CostEstimate {
  inputCostUsd:   number;
  outputCostUsd:  number;
  /** Multiplier applied on top of base model pricing for this tier. */
  tierMultiplier: number;
  totalCostUsd:   number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Every AI provider (real or mock) must implement this interface.
 *
 * Implementing a new provider:
 *   1. Create a class that implements IProvider.
 *   2. Register it in index.ts with its ModelTierMap.
 *   3. Done — the router never needs to change.
 */
export interface IProvider {
  /** Unique provider identifier — matches the key used in routing config. */
  readonly name: string;

  /**
   * Send a prompt to the model and return generated text plus usage data.
   * options.tier drives latency, response depth, and modelConfidence.
   *
   * When swapping in real API calls, replace only this method body.
   * The signature must remain stable.
   */
  generate(
    prompt: string,
    model: string,
    options: GenerateOptions,
  ): Promise<GenerateResult>;

  /**
   * Returns the estimated USD cost for a single call, including the
   * tier multiplier. Each provider owns its own base pricing table.
   */
  estimateCost(
    model: string,
    tier: ModelTier,
    inputTokens: number,
    outputTokens: number,
  ): CostEstimate;
}
