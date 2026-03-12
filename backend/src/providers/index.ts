/**
 * providers/index.ts — Composition root for the provider layer.
 *
 * This is the only file that imports concrete provider classes.
 * Everything else depends on IProvider (interface) or the providerManager
 * singleton exported here.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  To change which provider handles a domain  → edit ROUTING below        │
 * │  To change a model at a tier               → edit the register() call   │
 * │  To add a new provider                     → implement IProvider,       │
 * │                                              register here              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { ProviderManager }    from './providerManager';
import type { RoutingConfig } from './providerManager';
import { claudeProvider }     from './claudeProvider';
import { openaiProvider }     from './openaiProvider';
import { togetherProvider }   from './togetherProvider';

// ---------------------------------------------------------------------------
// Routing configuration
//
// Maps domain → { providerName, fallbackProviderName, reason }.
//
// Together AI is the default provider for most domains (open-source models,
// strong cost efficiency). OpenAI and Anthropic remain as fallbacks and
// primary providers for domains where they clearly excel (vision → GPT-4o,
// research/creative → Claude).
// ---------------------------------------------------------------------------

const ROUTING: RoutingConfig = {
  // ── Original 4 domains ───────────────────────────────────────────────────
  coding: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen Coder / DeepSeek Coder for structured code generation',
  },
  math: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen 72B for mathematical reasoning',
  },
  creative: {
    providerName:         'together',
    fallbackProviderName: 'anthropic',
    reason: 'Together Llama 3.3 70B / Qwen 2.5 7B for creative writing',
  },
  general: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen 2.5 7B for cost-efficient general-purpose queries',
  },

  // ── 7 new domains ─────────────────────────────────────────────────────────
  research: {
    providerName:         'anthropic',
    fallbackProviderName: 'together',
    reason: 'Claude excels at long-context research synthesis and citations',
  },
  summarization: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen 2.5 7B for cost-effective text compression',
  },
  vision: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Llama 4 Maverick for image and visual understanding',
  },
  coding_debug: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen Coder / DeepSeek Coder for debugging and error analysis',
  },
  general_chat: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Qwen 2.5 7B for low-latency conversational queries',
  },
  multilingual: {
    providerName:         'together',
    fallbackProviderName: 'anthropic',
    reason: 'Together Qwen 72B with strong multilingual capabilities',
  },
  math_reasoning: {
    providerName:         'together',
    fallbackProviderName: 'openai',
    reason: 'Together Llama 3.3 70B for chain-of-thought mathematical reasoning',
  },
};

// ---------------------------------------------------------------------------
// Provider registrations
//
// Each provider declares which model it uses at each capability tier.
// These tier models are the DEFAULT fallback path; the strategy engine
// may route to other registered models based on performance history.
//
// Together is registered last so its models appear later in exploration pools,
// ensuring diversity across providers during the cold-start phase.
// ---------------------------------------------------------------------------

export const providerManager = new ProviderManager(ROUTING)
  .register(openaiProvider, {
    cheap:    'gpt-4o-mini',
    balanced: 'gpt-4o-mini',  // OpenAI has no mid-tier model; escalation promotes to premium (gpt-4o)
    premium:  'gpt-4o',
  })
  .register(claudeProvider, {
    cheap:    'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-6',
    premium:  'claude-opus-4-6',
  })
  .register(togetherProvider, {
    cheap:    'Qwen/Qwen2.5-7B-Instruct-Turbo',
    balanced: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
    premium:  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  });

// ---------------------------------------------------------------------------
// Re-exports — consumers import everything they need from 'providers'
// ---------------------------------------------------------------------------

export { ProviderManager } from './providerManager';
export type {
  ResolvedModel,
  DispatchResult,
  ModelTierMap,
  RoutingConfig,
  DomainRoute,
  ProviderInfo,
} from './providerManager';
export type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
export * from './types';
