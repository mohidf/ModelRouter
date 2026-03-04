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

// ---------------------------------------------------------------------------
// Routing configuration
//
// Maps domain → { providerName, fallbackProviderName, reason }.
//
// Routing policy:
//   - Provider is selected by task domain (not by complexity).
//   - Tier is selected by task complexity: low→cheap, medium→balanced, high→premium.
//   - On low confidence, the router escalates:
//       1. Same provider, next tier up.
//       2. If already at premium → fallbackProviderName at premium.
// ---------------------------------------------------------------------------

const ROUTING: RoutingConfig = {
  coding: {
    providerName:         'openai',
    fallbackProviderName: 'anthropic',
    reason: 'OpenAI excels at code generation',
  },
  math: {
    providerName:         'openai',
    fallbackProviderName: 'anthropic',
    reason: 'OpenAI excels at mathematical reasoning',
  },
  creative: {
    providerName:         'anthropic',
    fallbackProviderName: 'openai',
    reason: 'Claude excels at creative writing',
  },
  general: {
    providerName:         'openai',
    fallbackProviderName: 'anthropic',
    reason: 'OpenAI handles general queries efficiently',
  },
};

// ---------------------------------------------------------------------------
// Provider registrations
//
// Each provider declares which model it uses at each capability tier.
// These are the only places model IDs appear in the codebase.
//
// Adding a new provider (e.g. Gemini):
//   1. Create backend/src/providers/geminiProvider.ts implementing IProvider.
//   2. Import the singleton below.
//   3. Chain: .register(geminiProvider, { cheap: '...', balanced: '...', premium: '...' })
//   4. Reference 'google' in ROUTING above for the domains you want to cover.
// ---------------------------------------------------------------------------

export const providerManager = new ProviderManager(ROUTING)
  .register(openaiProvider, {
    cheap:    'gpt-4o-mini',
    balanced: 'gpt-4o',
    premium:  'gpt-4o',
  })
  .register(claudeProvider, {
    cheap:    'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-6',
    premium:  'claude-opus-4-6',
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
