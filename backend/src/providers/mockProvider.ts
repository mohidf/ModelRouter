import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
import type { ModelTier } from './types';
import { simulateTierLatency, sampleTierConfidence, getTierCostMultiplier } from './mockUtils';

/**
 * Generic in-memory mock provider.
 *
 * Not tied to any real API — useful for:
 *   - Unit tests that need a fast, deterministic provider
 *   - Local development without network access
 *   - Fallback when no real provider is configured
 *
 * Still honours tier behaviour (latency, confidence, cost multiplier).
 */
export class MockProvider implements IProvider {
  readonly name = 'mock' as const;

  async generate(
    prompt:  string,
    model:   string,
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const { tier } = options;
    const start = Date.now();

    await simulateTierLatency(tier);

    const preview         = prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt;
    const text            = `[Mock / ${model} / ${tier}] Received ${prompt.length} chars: "${preview}"`;
    const inputTokens     = Math.ceil(prompt.length / 4);
    const outputTokens    = Math.ceil(text.length   / 4);
    const modelConfidence = sampleTierConfidence(tier);

    return { text, inputTokens, outputTokens, latencyMs: Date.now() - start, model, provider: this.name, tier, modelConfidence };
  }

  estimateCost(
    _model:       string,
    tier:         ModelTier,
    _inputTokens: number,
    _outputTokens: number,
  ): CostEstimate {
    const tierMultiplier = getTierCostMultiplier(tier);
    return { inputCostUsd: 0, outputCostUsd: 0, tierMultiplier, totalCostUsd: 0 };
  }
}

export const mockProvider = new MockProvider();
