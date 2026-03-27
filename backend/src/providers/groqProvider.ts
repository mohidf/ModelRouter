/**
 * groqProvider.ts
 *
 * Groq provider — uses the OpenAI-compatible API.
 * Base URL: https://api.groq.com/openai/v1
 *
 * Groq's free tier is used for unauthenticated / no-key users.
 * Models: llama-3.1-8b-instant (cheap/balanced), llama-3.3-70b-versatile (premium).
 */

import OpenAI from 'openai';
import type { IProvider, GenerateOptions, GenerateResult, CostEstimate } from './baseProvider';
import type { ModelTier } from './types';

const TIMEOUT_MS = 30_000;

// Groq free tier — effectively $0 with rate limits.
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'llama-3.1-8b-instant':     { inputPer1M: 0.05, outputPer1M: 0.08 },
  'llama-3.3-70b-versatile':  { inputPer1M: 0.59, outputPer1M: 0.79 },
};

const FALLBACK_PRICING = { inputPer1M: 0.59, outputPer1M: 0.79 };

let _client: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  if (apiKey) {
    return new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 2 });
  }
  if (!_client) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('GroqProvider: GROQ_API_KEY is not set.');
    _client = new OpenAI({ apiKey: key, baseURL: 'https://api.groq.com/openai/v1', maxRetries: 2 });
  }
  return _client;
}

export class GroqProvider implements IProvider {
  readonly name = 'groq' as const;

  async generate(prompt: string, model: string, options: GenerateOptions): Promise<GenerateResult> {
    const { tier, maxTokens, apiKey } = options;
    const client = getClient(apiKey);
    const start  = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
        { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
        { signal: controller.signal },
      );
      return {
        text:            completion.choices[0]?.message.content ?? '',
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
        throw new Error(`GroqProvider: request to ${model} timed out after ${TIMEOUT_MS}ms`);
      }
      if (err instanceof OpenAI.APIError) {
        throw new Error(`GroqProvider [${model}]: API error ${err.status} — ${err.message}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  estimateCost(model: string, _tier: ModelTier, inputTokens: number, outputTokens: number): CostEstimate {
    const { inputPer1M, outputPer1M } = PRICING[model] ?? FALLBACK_PRICING;
    const inputCostUsd  = inputTokens  * inputPer1M  / 1_000_000;
    const outputCostUsd = outputTokens * outputPer1M / 1_000_000;
    return { inputCostUsd, outputCostUsd, tierMultiplier: 1, totalCostUsd: inputCostUsd + outputCostUsd };
  }
}

export const groqProvider = new GroqProvider();

/** Models used for the free tier, keyed by complexity tier. */
export const GROQ_FREE_MODELS: Record<'cheap' | 'balanced' | 'premium', string> = {
  cheap:    'llama-3.1-8b-instant',
  balanced: 'llama-3.1-8b-instant',
  premium:  'llama-3.3-70b-versatile',
};
