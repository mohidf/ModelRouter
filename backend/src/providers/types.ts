/**
 * Domain-level types shared across services.
 *
 * Provider-implementation types (IProvider, GenerateResult, etc.) live in
 * baseProvider.ts. Route-level DTOs live here so services can import them
 * without pulling in any provider code.
 */

// ---------------------------------------------------------------------------
// Task classification types
// ---------------------------------------------------------------------------

export type TaskComplexity = 'low' | 'medium' | 'high';

export type TaskDomain =
  | 'coding'
  | 'math'
  | 'creative'
  | 'general'
  | 'research'
  | 'summarization'
  | 'vision'
  | 'coding_debug'
  | 'general_chat'
  | 'multilingual'
  | 'math_reasoning';

/** All valid task domain values — derive arrays from this to stay in sync. */
export const ALL_DOMAINS: readonly TaskDomain[] = [
  'coding', 'math', 'creative', 'general',
  'research', 'summarization', 'vision',
  'coding_debug', 'general_chat', 'multilingual', 'math_reasoning',
];

// ---------------------------------------------------------------------------
// Model tier — describes provider capability, distinct from task complexity.
//
//   TaskComplexity  →  ModelTier
//   low             →  cheap      (fast, low cost, shorter output)
//   medium          →  balanced   (moderate latency and cost)
//   high            →  premium    (slower, higher cost, richer output)
//
// The mapping lives in ProviderManager; nothing else should hardcode it.
// ---------------------------------------------------------------------------

export type ModelTier = 'cheap' | 'balanced' | 'premium';

// ---------------------------------------------------------------------------
// Route DTOs
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  domain: TaskDomain;
  complexity: TaskComplexity;
  /** 0–1: classifier certainty about the domain assignment. */
  confidence: number;
  estimatedTokens: number;
}

export interface ModelSelection {
  /** Provider name (e.g. "openai", "anthropic"). */
  provider: string;
  /** Canonical model identifier (e.g. "gpt-4o", "claude-opus-4-6"). */
  model: string;
  /** Which capability tier was used for this call. */
  tier: ModelTier;
  /** Human-readable explanation of why this model was chosen. */
  reason: string;
  /** 0–1: tier-simulated confidence in this model's response quality. */
  modelConfidence: number;
}

export interface RouteRequest {
  prompt: string;
  maxTokens?: number;
  preferCost?: boolean;
}

/** A single scored candidate from the strategy engine. */
export interface EvaluatedOption {
  /** Canonical model ID (e.g. "meta-llama/Llama-3.3-70B-Instruct"). */
  modelId:           string;
  provider:          string;
  tier:              ModelTier;
  score:             number;
  averageConfidence: number;
  averageLatencyMs:  number;
  averageCostUsd:    number;
  escalationRate:    number;
  totalRequests:     number;
}

export interface RouteResponse {
  classification: ClassificationResult;
  initialModel: ModelSelection;
  finalModel: ModelSelection;
  escalated: boolean;
  response: string;
  latencyMs: number;
  /** Total estimated cost in USD across all provider calls (initial + escalation). */
  totalCostUsd: number;
  /** How the strategy engine made its routing decision. */
  strategyMode: 'fallback' | 'exploration' | 'exploitation';
  /** All scored candidates, sorted best-first. Empty when strategyMode is 'fallback'. */
  evaluatedOptions: EvaluatedOption[];
}
