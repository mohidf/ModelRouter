/**
 * models.ts — Canonical model registry for all supported AI models.
 *
 * This is the single source of truth for model IDs, providers, capabilities,
 * approximate costs, and domain strengths. Every file that needs to resolve
 * a model ID → metadata should import from here.
 *
 * Keep costs in sync with provider pricing pages. Costs are per-1k-tokens
 * (input and output separately) in USD.
 */

import type { TaskDomain, ModelTier } from '../providers/types';

export type ProviderName = 'openai' | 'anthropic' | 'together';

export interface ModelDescriptor {
  /** Canonical API model string (e.g. "meta-llama/Llama-3.3-70B-Instruct"). */
  id:              string;
  provider:        ProviderName;
  /** Short human-readable name for UI display. */
  displayName:     string;
  /** Capability tier — maps to cheap/balanced/premium routing paths. */
  tier:            ModelTier;
  /** Approximate cost per 1 000 tokens (USD). */
  costPer1kTokens: { input: number; output: number };
  /** Maximum context window in tokens. */
  contextWindow:   number;
  /** Task domains this model performs particularly well on. */
  strengths:       readonly TaskDomain[];
}

export const MODEL_REGISTRY: readonly ModelDescriptor[] = [

  // ── OpenAI ────────────────────────────────────────────────────────────────

  {
    id:              'gpt-4o-mini',
    provider:        'openai',
    displayName:     'GPT-4o mini',
    tier:            'cheap',
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    contextWindow:   128_000,
    strengths:       ['coding', 'general_chat', 'summarization'],
  },
  {
    id:              'gpt-4o',
    provider:        'openai',
    displayName:     'GPT-4o',
    tier:            'premium',
    costPer1kTokens: { input: 0.005, output: 0.015 },
    contextWindow:   128_000,
    strengths:       ['coding', 'coding_debug', 'math', 'research', 'vision'],
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────

  {
    id:              'claude-haiku-4-5-20251001',
    provider:        'anthropic',
    displayName:     'Claude Haiku',
    tier:            'cheap',
    costPer1kTokens: { input: 0.00025, output: 0.00125 },
    contextWindow:   200_000,
    strengths:       ['general_chat', 'summarization'],
  },
  {
    id:              'claude-sonnet-4-6',
    provider:        'anthropic',
    displayName:     'Claude Sonnet',
    tier:            'balanced',
    costPer1kTokens: { input: 0.003, output: 0.015 },
    contextWindow:   200_000,
    strengths:       ['creative', 'research', 'multilingual'],
  },
  {
    id:              'claude-opus-4-6',
    provider:        'anthropic',
    displayName:     'Claude Opus',
    tier:            'premium',
    costPer1kTokens: { input: 0.015, output: 0.075 },
    contextWindow:   200_000,
    strengths:       ['creative', 'research', 'multilingual', 'coding'],
  },

  // ── Together AI — fast / cheap path ───────────────────────────────────────
  //
  // Use the "-Turbo" suffix variants — these are Together's serverless
  // (pay-per-token) models available on the standard API endpoint.
  // Non-Turbo model IDs (e.g. Mistral-7B-v0.3, Qwen2.5-7B) require
  // Together's Dedicated Endpoints and return HTTP 400 on the standard API.

  // ── Together AI — balanced path ───────────────────────────────────────────

  {
    id:              'Qwen/Qwen2.5-7B-Instruct-Turbo',
    provider:        'together',
    displayName:     'Qwen 2.5 7B Turbo',
    tier:            'balanced',
    costPer1kTokens: { input: 0.0003, output: 0.0003 },
    contextWindow:   32_768,
    strengths:       ['summarization', 'multilingual', 'general'],
  },
  {
    id:              'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
    provider:        'together',
    displayName:     'Llama 4 Maverick 17B',
    tier:            'balanced',
    costPer1kTokens: { input: 0.0002, output: 0.0002 },
    contextWindow:   1_048_576,
    strengths:       ['vision', 'general'],
  },

  // ── Together AI — premium path ────────────────────────────────────────────

  {
    id:              'Qwen/Qwen2.5-72B-Instruct-Turbo',
    provider:        'together',
    displayName:     'Qwen 2.5 72B Turbo',
    tier:            'premium',
    costPer1kTokens: { input: 0.0012, output: 0.0012 },
    contextWindow:   131_072,
    strengths:       ['math', 'math_reasoning', 'multilingual'],
  },
  {
    id:              'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    provider:        'together',
    displayName:     'Llama 3.3 70B Turbo',
    tier:            'premium',
    costPer1kTokens: { input: 0.00088, output: 0.00088 },
    contextWindow:   131_072,
    strengths:       ['general', 'research', 'math_reasoning'],
  },
  {
    id:              'deepseek-ai/DeepSeek-V3',
    provider:        'together',
    displayName:     'DeepSeek V3',
    tier:            'premium',
    costPer1kTokens: { input: 0.00125, output: 0.00125 },
    contextWindow:   131_072,
    strengths:       ['coding', 'math', 'research'],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Find a model by its canonical API ID. Returns undefined if not in registry. */
export function getModelById(id: string): ModelDescriptor | undefined {
  return MODEL_REGISTRY.find(m => m.id === id);
}

/** Return all models that list the given domain as a strength. */
export function getModelsByStrength(domain: TaskDomain): ModelDescriptor[] {
  return MODEL_REGISTRY.filter(m => m.strengths.includes(domain));
}
