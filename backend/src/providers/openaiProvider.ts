import OpenAI from 'openai';
import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
import type { ModelTier } from './types';
import { sampleTierConfidence, getTierCostMultiplier } from './mockUtils';

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

/** Maximum ms to wait for a response before aborting. */
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Pricing — OpenAI list prices (USD per 1 M tokens, before tier multiplier)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M:  number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { inputPer1M:  0.15, outputPer1M:  0.60 },
  'gpt-4o':      { inputPer1M:  5.00, outputPer1M: 15.00 },
};

const FALLBACK_PRICING: ModelPricing = { inputPer1M: 5.00, outputPer1M: 15.00 };

// ---------------------------------------------------------------------------
// Singleton client (lazy — throws clearly when API key is missing)
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenAIProvider: OPENAI_API_KEY is not set. ' +
        'Add it to your .env file or set it in the environment.',
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenAIProvider implements IProvider {
  readonly name = 'openai' as const;

  async generate(
    prompt:  string,
    model:   string,
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const { tier, maxTokens } = options;
    const start = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const completion = await getClient().chat.completions.create(
        {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      );

      const text = completion.choices[0]?.message.content ?? '';

      return {
        text,
        inputTokens:     completion.usage?.prompt_tokens     ?? 0,
        outputTokens:    completion.usage?.completion_tokens ?? 0,
        latencyMs:       Date.now() - start,
        model,
        provider:        this.name,
        tier,
        // OpenAI does not expose a per-response confidence score — simulate from tier.
        modelConfidence: sampleTierConfidence(tier),
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `OpenAIProvider: request to ${model} timed out after ${TIMEOUT_MS} ms`,
        );
      }
      if (err instanceof OpenAI.APIError) {
        throw new Error(
          `OpenAIProvider: OpenAI API error ${err.status} — ${err.message}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  estimateCost(
    model:        string,
    tier:         ModelTier,
    inputTokens:  number,
    outputTokens: number,
  ): CostEstimate {
    const { inputPer1M, outputPer1M } = PRICING[model] ?? FALLBACK_PRICING;
    const tierMultiplier = getTierCostMultiplier(tier);
    const inputCostUsd   = (inputTokens  * inputPer1M  / 1_000_000) * tierMultiplier;
    const outputCostUsd  = (outputTokens * outputPer1M / 1_000_000) * tierMultiplier;
    return { inputCostUsd, outputCostUsd, tierMultiplier, totalCostUsd: inputCostUsd + outputCostUsd };
  }
}

export const openaiProvider = new OpenAIProvider();
