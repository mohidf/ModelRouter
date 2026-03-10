import type { IClassifier } from './classifier';
import { RuleBasedClassifier } from './classifier';
import { EmbeddingClassifier } from './embeddingClassifier';
import type { ClassificationResult } from '../providers/types';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Threshold
//
// If the rule-based classifier returns confidence ≥ this value, the embedding
// API is skipped entirely.  The prompt clearly matched a keyword pattern and
// paying for an embedding call adds latency without improving accuracy.
//
// 0.80 means: "at least 80 % of the total signal weight landed on one domain."
// Empirically this covers most unambiguous prompts (code fences, named
// languages, explicit math keywords) while routing ambiguous prompts through
// the embedding path.
// ---------------------------------------------------------------------------

const FAST_PATH_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// HybridClassifier
// ---------------------------------------------------------------------------

/**
 * Two-stage classifier:
 *
 *   Stage 1 — RuleBasedClassifier (fast path, ~0 ms, no API cost)
 *     If confidence ≥ FAST_PATH_THRESHOLD → return immediately.
 *
 *   Stage 2 — EmbeddingClassifier (slow path, ~100–300 ms, ~$0.000002/call)
 *     Invoked only when stage 1 is uncertain.  Returns embedding-derived
 *     domain + confidence.
 *
 *     Domain: from embedding (more accurate on ambiguous / novel prompts).
 *     Complexity + estimatedTokens: always from rule-based (word-count signals
 *     are structural, not semantic — embeddings add nothing here).
 *
 *   Fallback: if the embedding call fails (no API key, network error, quota
 *     exceeded), the rule-based result is returned and a warning is logged.
 *     The route request is never blocked by classifier infrastructure.
 */
export class HybridClassifier implements IClassifier {
  private readonly rule:      RuleBasedClassifier;
  private readonly embedding: EmbeddingClassifier;

  constructor(rule?: RuleBasedClassifier, embedding?: EmbeddingClassifier) {
    this.rule      = rule      ?? new RuleBasedClassifier();
    this.embedding = embedding ?? new EmbeddingClassifier();
  }

  async classify(prompt: string): Promise<ClassificationResult> {
    const ruleResult = await this.rule.classify(prompt);

    // ── Fast path ────────────────────────────────────────────────────────────
    if (ruleResult.confidence >= FAST_PATH_THRESHOLD) {
      logger.debug('HybridClassifier: fast path (rule-based)', {
        domain:     ruleResult.domain,
        confidence: ruleResult.confidence,
      });
      return ruleResult;
    }

    // ── Slow path ────────────────────────────────────────────────────────────
    try {
      const embResult = await this.embedding.classifyDomain(prompt);

      logger.debug('HybridClassifier: slow path (embedding)', {
        ruleDomain:       ruleResult.domain,
        ruleConfidence:   ruleResult.confidence,
        embDomain:        embResult.domain,
        embConfidence:    embResult.confidence,
      });

      return {
        domain:          embResult.domain,
        confidence:      embResult.confidence,
        // Complexity and token count are structural properties —
        // keep the rule-based values which are always computed for free.
        complexity:      ruleResult.complexity,
        estimatedTokens: ruleResult.estimatedTokens,
      };
    } catch (err) {
      logger.warn('HybridClassifier: embedding failed, using rule-based fallback', {
        err: String(err),
      });
      return ruleResult;
    }
  }

  /**
   * Pre-warm the embedding anchor vectors at startup so the first real
   * request does not pay initialisation latency.
   */
  async warmUp(): Promise<void> {
    await this.embedding.warmUp();
  }
}

export const hybridClassifier: IClassifier = new HybridClassifier();
