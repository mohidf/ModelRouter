/**
 * togetherProvider.ts
 *
 * Together AI provider — uses the OpenAI-compatible API.
 * Base URL: https://api.together.xyz/v1
 * Auth:     Authorization: Bearer ${TOGETHER_API_KEY}
 *
 * Because Together mirrors the OpenAI chat completions spec, this reuses the
 * same OpenAI SDK with a custom baseURL. Error handling, timeouts, and response
 * parsing are identical to openaiProvider.ts.
 */

import OpenAI from 'openai';
import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
import type { ModelTier } from './types';

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Pricing — Together AI list prices (USD per 1 M tokens)
// Sourced from https://api.together.xyz/models (pricing as of 2025-Q1)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M:  number;
  outputPer1M: number;
}

// Together AI serverless (Turbo) model pricing — USD per 1 M tokens.
// Only Turbo variants are available on the standard serverless API endpoint.
// Non-Turbo IDs require dedicated endpoints and are no longer in the registry.
const PRICING: Record<string, ModelPricing> = {
  // Balanced tier (also used as cheap default)
  'Qwen/Qwen2.5-7B-Instruct-Turbo':                { inputPer1M:  0.30, outputPer1M:  0.30 },
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct':  { inputPer1M:  0.20, outputPer1M:  0.20 },
  // Premium tier
  'Qwen/Qwen2.5-72B-Instruct-Turbo':               { inputPer1M:  1.20, outputPer1M:  1.20 },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo':       { inputPer1M:  0.88, outputPer1M:  0.88 },
  'deepseek-ai/DeepSeek-V3':                        { inputPer1M:  1.25, outputPer1M:  1.25 },
};

const FALLBACK_PRICING: ModelPricing = { inputPer1M: 1.20, outputPer1M: 1.20 };

// ---------------------------------------------------------------------------
// Singleton client (lazy)
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'TogetherProvider: TOGETHER_API_KEY is not set. ' +
        'Add it to your .env file. Obtain a key at https://api.together.xyz/settings/api-keys',
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL:    'https://api.together.xyz/v1',
      maxRetries: 2,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class TogetherProvider implements IProvider {
  readonly name = 'together' as const;

  async generate(
    prompt:  string,
    model:   string,
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const { tier, maxTokens, apiKey } = options;
    // Use a per-request client when the caller supplies their own key.
    const client = apiKey
      ? new OpenAI({ apiKey, baseURL: 'https://api.together.xyz/v1', maxRetries: 2 })
      : getClient();
    const start = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
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
        modelConfidence: 1.0,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `TogetherProvider: request to ${model} timed out after ${TIMEOUT_MS} ms`,
        );
      }
      if (err instanceof OpenAI.APIError) {
        throw new Error(
          `TogetherProvider [${model}]: API error ${err.status} — ${err.message}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  estimateCost(
    model:        string,
    _tier:        ModelTier,
    inputTokens:  number,
    outputTokens: number,
  ): CostEstimate {
    const { inputPer1M, outputPer1M } = PRICING[model] ?? FALLBACK_PRICING;
    const inputCostUsd  = inputTokens  * inputPer1M  / 1_000_000;
    const outputCostUsd = outputTokens * outputPer1M / 1_000_000;
    return { inputCostUsd, outputCostUsd, tierMultiplier: 1, totalCostUsd: inputCostUsd + outputCostUsd };
  }
}

export const togetherProvider = new TogetherProvider();
