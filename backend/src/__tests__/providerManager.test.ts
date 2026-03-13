/**
 * providerManager.test.ts
 *
 * Unit tests for ProviderManager.
 *
 * The ProviderManager is pure in-memory logic: no network calls, no DB.
 * We build a minimal registry with two mock providers and verify:
 *   1. Registration and lookup
 *   2. resolve() — domain + complexity → provider + model + tier
 *   3. resolveByModelId() — model ID lookup via MODEL_REGISTRY
 *   4. escalate() — same-provider tier upgrade, then cross-provider fallback
 *   5. Error paths — unregistered provider, unknown model ID
 */

import { ProviderManager } from '../providers/providerManager';
import type { ModelTierMap, RoutingConfig } from '../providers/providerManager';
import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from '../providers/baseProvider';
import type { ModelTier } from '../providers/types';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal mock providers
// ─────────────────────────────────────────────────────────────────────────────

function makeProvider(name: string): IProvider {
  return {
    name,
    async generate(_prompt: string, model: string, _options: GenerateOptions): Promise<GenerateResult> {
      return {
        text: `response from ${name}/${model}`,
        inputTokens: 10, outputTokens: 20,
        latencyMs: 100, model, provider: name,
        tier: 'cheap', modelConfidence: 1.0,
      };
    },
    estimateCost(_model: string, _tier: ModelTier, _input: number, _output: number): CostEstimate {
      return { inputCostUsd: 0, outputCostUsd: 0, tierMultiplier: 1, totalCostUsd: 0 };
    },
  };
}

const providerA = makeProvider('alpha');
const providerB = makeProvider('beta');

const TIERS_A: ModelTierMap = { cheap: 'alpha-mini', balanced: 'alpha-std', premium: 'alpha-pro' };
const TIERS_B: ModelTierMap = { cheap: 'beta-mini',  balanced: 'beta-std',  premium: 'beta-pro'  };

const ROUTING: RoutingConfig = {
  coding:        { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for coding'   },
  math:          { providerName: 'beta',  fallbackProviderName: 'alpha', reason: 'beta for math'      },
  creative:      { providerName: 'alpha',                                reason: 'alpha for creative'  },
  general:       { providerName: 'beta',                                 reason: 'beta for general'    },
  research:      { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for research'  },
  summarization: { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for summ'      },
  vision:        { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for vision'    },
  coding_debug:  { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for debug'     },
  general_chat:  { providerName: 'beta',  fallbackProviderName: 'alpha', reason: 'beta for chat'       },
  multilingual:  { providerName: 'alpha', fallbackProviderName: 'beta',  reason: 'alpha for multi'     },
  math_reasoning:{ providerName: 'beta',  fallbackProviderName: 'alpha', reason: 'beta for reasoning'  },
};

function buildManager(): ProviderManager {
  return new ProviderManager(ROUTING)
    .register(providerA, TIERS_A)
    .register(providerB, TIERS_B);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registration
// ─────────────────────────────────────────────────────────────────────────────

describe('ProviderManager — registration', () => {

  it('registers a provider and returns it by name', () => {
    const manager = buildManager();
    expect(manager.getProvider('alpha')).toBe(providerA);
    expect(manager.getProvider('beta')).toBe(providerB);
  });

  it('throws when looking up an unregistered provider', () => {
    const manager = buildManager();
    expect(() => manager.getProvider('unknown')).toThrow(/unknown/);
  });

  it('listProviders returns all registered providers with their tier maps', () => {
    const manager = buildManager();
    const list = manager.listProviders();
    expect(list).toHaveLength(2);
    const alpha = list.find(p => p.name === 'alpha')!;
    expect(alpha.tiers).toEqual(TIERS_A);
  });

  it('getTiers returns the tier map for a registered provider', () => {
    const manager = buildManager();
    expect(manager.getTiers('alpha')).toEqual(TIERS_A);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolve() — domain + complexity → provider + model + tier
// ─────────────────────────────────────────────────────────────────────────────

describe('ProviderManager — resolve()', () => {

  it('routes coding to alpha provider', () => {
    const manager = buildManager();
    const resolved = manager.resolve('coding', 'low');
    expect(resolved.provider).toBe(providerA);
  });

  it('routes math to beta provider', () => {
    const manager = buildManager();
    const resolved = manager.resolve('math', 'medium');
    expect(resolved.provider).toBe(providerB);
  });

  it('maps low complexity to cheap tier', () => {
    const manager = buildManager();
    const resolved = manager.resolve('coding', 'low');
    expect(resolved.tier).toBe('cheap');
    expect(resolved.model).toBe(TIERS_A.cheap);
  });

  it('maps medium complexity to balanced tier', () => {
    const manager = buildManager();
    const resolved = manager.resolve('coding', 'medium');
    expect(resolved.tier).toBe('balanced');
    expect(resolved.model).toBe(TIERS_A.balanced);
  });

  it('maps high complexity to balanced tier (escalation promotes to premium)', () => {
    // Why: COMPLEXITY_TO_TIER maps high → balanced, not premium.
    // The escalation path handles the premium promotion when confidence is low.
    // Direct routing to premium on high-complexity cold-starts would prevent
    // the strategy engine from accumulating balanced-tier data.
    const manager = buildManager();
    const resolved = manager.resolve('coding', 'high');
    expect(resolved.tier).toBe('balanced');
  });

  it('includes a non-empty reason string', () => {
    const manager = buildManager();
    const resolved = manager.resolve('coding', 'low');
    expect(typeof resolved.reason).toBe('string');
    expect(resolved.reason.length).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. resolveByModelId() — uses MODEL_REGISTRY for lookup
// ─────────────────────────────────────────────────────────────────────────────

describe('ProviderManager — resolveByModelId()', () => {

  it('resolves a real model from the registry', () => {
    // Use a real registered provider so the manager can find it.
    // The manager in this test only has 'alpha' and 'beta', but resolveByModelId
    // looks up the model in MODEL_REGISTRY which references 'openai'/'anthropic'/'together'.
    // We use a separate manager with real providers wired up for this test.
    //
    // Rather than importing real providers (which would require API keys),
    // we register a mock with the name that MODEL_REGISTRY expects.
    const mockOpenai = makeProvider('openai');
    const manager = new ProviderManager(ROUTING)
      .register(mockOpenai, { cheap: 'gpt-4o-mini', balanced: 'gpt-4o-mini', premium: 'gpt-4o' });

    const resolved = manager.resolveByModelId('gpt-4o-mini', 'test reason');
    expect(resolved.provider).toBe(mockOpenai);
    expect(resolved.model).toBe('gpt-4o-mini');
    expect(resolved.tier).toBe('cheap');
    expect(resolved.reason).toBe('test reason');
  });

  it('throws when the model ID is not in the registry', () => {
    const manager = buildManager();
    expect(() => manager.resolveByModelId('nonexistent-model-xyz', 'test')).toThrow(/nonexistent-model-xyz/);
  });

  it('throws when the model is in the registry but its provider is not registered', () => {
    // gpt-4o-mini is in MODEL_REGISTRY under provider 'openai',
    // but our test manager only has 'alpha' and 'beta'.
    const manager = buildManager();
    expect(() => manager.resolveByModelId('gpt-4o-mini', 'test')).toThrow(/openai/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. escalate() — tier upgrade and cross-provider fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('ProviderManager — escalate()', () => {

  it('promotes cheap to balanced within the same provider', () => {
    const manager = buildManager();
    const initial = manager.resolve('coding', 'low');  // cheap
    const escalated = manager.escalate(initial, 'coding');

    expect(escalated).not.toBeNull();
    expect(escalated!.tier).toBe('balanced');
    expect(escalated!.provider).toBe(providerA);
    expect(escalated!.model).toBe(TIERS_A.balanced);
  });

  it('promotes balanced to premium within the same provider', () => {
    const manager = buildManager();
    const initial = manager.resolve('coding', 'medium');  // balanced
    const escalated = manager.escalate(initial, 'coding');

    expect(escalated).not.toBeNull();
    expect(escalated!.tier).toBe('premium');
    expect(escalated!.provider).toBe(providerA);
    expect(escalated!.model).toBe(TIERS_A.premium);
  });

  it('cross-escalates to fallback provider when already at premium', () => {
    // Why: when the primary provider is already at premium and confidence is
    // still low, the only option is to try a different provider.
    const manager = buildManager();
    // Manually build a premium resolved model for alpha
    const initial = { provider: providerA, model: TIERS_A.premium, tier: 'premium' as ModelTier, reason: 'test' };
    const escalated = manager.escalate(initial, 'coding');  // fallback is 'beta'

    expect(escalated).not.toBeNull();
    expect(escalated!.provider).toBe(providerB);
    expect(escalated!.tier).toBe('premium');
    expect(escalated!.model).toBe(TIERS_B.premium);
  });

  it('returns null when already at premium and no fallback provider is configured', () => {
    // Why: some domains (creative) have no fallback — once at premium,
    // escalation stops. Returning null signals the router to use the result as-is.
    const manager = buildManager();
    // creative has no fallbackProviderName
    const initial = { provider: providerA, model: TIERS_A.premium, tier: 'premium' as ModelTier, reason: 'test' };
    const escalated = manager.escalate(initial, 'creative');

    expect(escalated).toBeNull();
  });

  it('returns null when already at premium and fallback is the same as current', () => {
    // Why: a routing config that accidentally sets fallback === primary must
    // not cause infinite escalation — the manager must detect this and stop.
    const routingWithSameFallback: RoutingConfig = {
      ...ROUTING,
      coding: { providerName: 'alpha', fallbackProviderName: 'alpha', reason: 'same fallback' },
    };
    const manager = new ProviderManager(routingWithSameFallback)
      .register(providerA, TIERS_A)
      .register(providerB, TIERS_B);

    const initial = { provider: providerA, model: TIERS_A.premium, tier: 'premium' as ModelTier, reason: 'test' };
    expect(manager.escalate(initial, 'coding')).toBeNull();
  });

});
