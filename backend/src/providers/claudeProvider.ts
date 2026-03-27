import Anthropic from '@anthropic-ai/sdk';
import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
import type { ModelTier } from './types';

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

/** Maximum ms to wait for a response before aborting. */
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Pricing — Anthropic list prices (USD per 1 M tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPer1M:  number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { inputPer1M:  0.25, outputPer1M:   1.25 },
  'claude-sonnet-4-6':         { inputPer1M:  3.00, outputPer1M:  15.00 },
  'claude-opus-4-6':           { inputPer1M: 15.00, outputPer1M:  75.00 },
};

const FALLBACK_PRICING: ModelPricing = { inputPer1M: 3.00, outputPer1M: 15.00 };

// ---------------------------------------------------------------------------
// Singleton client (lazy — throws clearly when API key is missing)
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ClaudeProvider: ANTHROPIC_API_KEY is not set. ' +
        'Add it to your .env file or set it in the environment.',
      );
    }
    // maxRetries: the SDK handles 429 and 5xx back-off correctly,
    // including Retry-After headers — more reliable than hand-rolled retry.
    _client = new Anthropic({ apiKey, maxRetries: 2 });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClaudeProvider implements IProvider {
  readonly name = 'anthropic' as const;

  async generate(
    prompt:  string,
    model:   string,
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const { tier, maxTokens, apiKey } = options;
    // Use a per-request client when the caller supplies their own key.
    // This avoids mutating the shared singleton and is safe for concurrent requests.
    const client = apiKey
      ? new Anthropic({ apiKey, maxRetries: 2 })
      : getClient();
    const start = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const message = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      );

      const textBlock = message.content.find(b => b.type === 'text');
      const text = textBlock?.type === 'text' ? textBlock.text : '';

      return {
        text,
        inputTokens:     message.usage.input_tokens,
        outputTokens:    message.usage.output_tokens,
        latencyMs:       Date.now() - start,
        model,
        provider:        this.name,
        tier,
        // 1.0 = request completed successfully. Errors throw and never reach here.
        // averageConfidence in the performance store therefore tracks success rate.
        modelConfidence: 1.0,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `ClaudeProvider: request to ${model} timed out after ${TIMEOUT_MS} ms`,
        );
      }
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `ClaudeProvider: Anthropic API error ${err.status} — ${err.message}`,
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
    // Use list pricing directly — no tier multiplier. The pricing table already
    // reflects the actual cost difference between models (haiku vs sonnet vs opus).
    // Applying an additional multiplier inflated costs beyond what Anthropic charges.
    const inputCostUsd  = inputTokens  * inputPer1M  / 1_000_000;
    const outputCostUsd = outputTokens * outputPer1M / 1_000_000;
    return { inputCostUsd, outputCostUsd, tierMultiplier: 1, totalCostUsd: inputCostUsd + outputCostUsd };
  }
}

export const claudeProvider = new ClaudeProvider();
