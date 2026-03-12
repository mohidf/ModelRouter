import OpenAI from 'openai';
import type { TaskDomain } from '../providers/types';
import { DOMAIN_ANCHORS } from './anchors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * OpenAI embedding model used for both anchor pre-computation and live prompts.
 *
 * text-embedding-3-small: 1536 dimensions, ~$0.02 per 1 M tokens.
 * Chosen over text-embedding-3-large because the classification task only
 * needs to separate four coarse domains — the extra resolution of the large
 * model does not justify the 5× cost difference.
 */
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Domain name with its pre-computed anchor vectors. */
interface AnchorEntry {
  domain: TaskDomain;
  vectors: number[][];
}

/** Return value of classifyDomain — split out so HybridClassifier
 *  can merge with rule-based complexity independently. */
export interface EmbeddingDomainResult {
  domain: TaskDomain;
  /** Normalised similarity ratio in [0, 1]. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// EmbeddingClassifier
// ---------------------------------------------------------------------------

/**
 * Classifies prompts against pre-computed anchor vectors using cosine similarity.
 *
 * Lifecycle:
 *   1. First call to `classifyDomain()` triggers `init()`.
 *   2. `init()` embeds all anchor prompts from `DOMAIN_ANCHORS` in parallel.
 *   3. Subsequent calls embed only the incoming prompt — anchors are cached.
 *
 * Init is idempotent: concurrent calls share a single `Promise<void>` so
 * the OpenAI API is never called more than once per anchor set.
 */
export class EmbeddingClassifier {
  private readonly client: OpenAI;
  private anchors: AnchorEntry[] | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Classify the prompt's domain by finding the anchor set with the highest
   * mean cosine similarity.
   *
   * Confidence is the normalised ratio:
   *   top_domain_score / sum(max(0, score) for all domains)
   *
   * Using only positive contributions in the denominator prevents a domain
   * with negative similarity (completely unrelated) from inflating total and
   * deflating confidence of the true match.
   */
  async classifyDomain(prompt: string): Promise<EmbeddingDomainResult> {
    await this.ensureInit();

    const promptVec = await this.embed(prompt);

    const scores = this.anchors!.map(({ domain, vectors }) => ({
      domain,
      // Max (nearest-neighbour) similarity: finds the single closest anchor in each
      // domain rather than averaging all anchors. This prevents diverse anchor sets
      // (like 'general' with 20 varied examples) from having their centroid pulled
      // away from the query by unrelated anchors — the exact-match anchor dominates.
      score: this.maxSimilarity(promptVec, vectors),
    }));

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];

    // Margin-based confidence: how much better is the top domain than the runner-up?
    // Formula: (top - second) / top — range [0, 1], domain-count-independent.
    // The old sum-based formula produced ~0.10–0.15 with 12 domains regardless of
    // match quality, causing almost everything to fall below the escalation threshold.
    const second = scores[1]?.score ?? 0;
    const raw = top.score > 0
      ? (top.score - Math.max(0, second)) / top.score
      : 0;
    const confidence = parseFloat(Math.min(Math.max(raw, 0), 1).toFixed(2));

    return {
      domain:     top.domain,
      confidence: Math.min(Math.max(confidence, 0), 1),
    };
  }

  /**
   * Pre-compute anchor embeddings now so the first real request does not
   * pay the initialisation latency.  Call this from `index.ts` after `listen()`.
   *
   * Calling it multiple times is safe — init only runs once.
   */
  async warmUp(): Promise<void> {
    await this.ensureInit();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  private async ensureInit(): Promise<void> {
    if (this.anchors !== null) return;
    if (!this.initPromise) this.initPromise = this.init();
    return this.initPromise;
  }

  private async init(): Promise<void> {
    logger.info('EmbeddingClassifier: pre-computing anchor vectors', {
      model:   EMBEDDING_MODEL,
      domains: DOMAIN_ANCHORS.map(d => d.domain),
    });

    const entries: AnchorEntry[] = await Promise.all(
      DOMAIN_ANCHORS.map(async ({ domain, examples }) => ({
        domain,
        vectors: await Promise.all(examples.map(ex => this.embed(ex))),
      }))
    );

    this.anchors = entries;
    logger.info('EmbeddingClassifier: anchor vectors ready');
  }

  // ── Embedding + similarity helpers ───────────────────────────────────────

  private async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  }

  /** Max cosine similarity (nearest-neighbour) of a query against an anchor set. */
  private maxSimilarity(query: number[], references: number[][]): number {
    return references.reduce(
      (best, ref) => Math.max(best, this.cosineSimilarity(query, ref)),
      -Infinity,
    );
  }

  /**
   * Cosine similarity between two equal-length vectors.
   * Returns 0 if either vector is the zero vector (degenerate input).
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

export const embeddingClassifier = new EmbeddingClassifier();
