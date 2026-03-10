import type { ModelTier, TaskDomain } from './types';

// ---------------------------------------------------------------------------
// Tier characteristics
//
// All simulation behaviour is driven by tier, never inferred from model name.
// Swap in real values from provider docs when going live.
// ---------------------------------------------------------------------------

interface TierCharacteristics {
  /** Simulated wall-clock latency range in milliseconds. */
  latency:         { min: number; max: number };
  /** Sampled model confidence range (0–1). */
  confidenceRange: [number, number];
  /**
   * Multiplier applied on top of base model pricing.
   * cheap < 1 (batch / cached pricing), premium > 1 (priority access).
   */
  costMultiplier:  number;
}

const TIER_CHARACTERISTICS: Record<ModelTier, TierCharacteristics> = {
  cheap:    { latency: { min: 100, max:  350 }, confidenceRange: [0.65, 0.80], costMultiplier: 0.8  },
  balanced: { latency: { min: 400, max:  750 }, confidenceRange: [0.80, 0.92], costMultiplier: 1.0  },
  premium:  { latency: { min: 750, max: 1400 }, confidenceRange: [0.90, 0.99], costMultiplier: 1.5  },
};

/** Simulate the per-tier network + processing delay. */
export async function simulateTierLatency(tier: ModelTier): Promise<void> {
  const { min, max } = TIER_CHARACTERISTICS[tier].latency;
  const delay = min + Math.random() * (max - min);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

/** Sample a model confidence value for the given tier. */
export function sampleTierConfidence(tier: ModelTier): number {
  const [min, max] = TIER_CHARACTERISTICS[tier].confidenceRange;
  return parseFloat((min + Math.random() * (max - min)).toFixed(2));
}

/** Return the cost multiplier for a tier (applied on top of base pricing). */
export function getTierCostMultiplier(tier: ModelTier): number {
  return TIER_CHARACTERISTICS[tier].costMultiplier;
}

// ---------------------------------------------------------------------------
// Response text — length and depth scale with tier
// ---------------------------------------------------------------------------

const RESPONSES: Record<TaskDomain, Record<ModelTier, string>> = {
  coding: {
    cheap: `Here is a concise solution. The core logic fits in a single function with clear inputs and outputs. Make sure to handle the null case before returning.`,

    balanced: `Here is a well-structured implementation. I have applied the single-responsibility principle to keep each function focused. The approach uses [pattern] for maintainability. Input validation is handled at the boundary, and the core algorithm runs in O(n) time. Error propagation follows the established pattern in your codebase.`,

    premium: `Here is a comprehensive implementation with full context. After analysing the requirements, I chose [pattern] over alternatives because it scales better under concurrent load and keeps the dependency graph flat. The solution is split into three layers: validation, transformation, and persistence. Edge cases covered include empty inputs, Unicode boundaries, and timeout scenarios. I have included inline documentation for the non-obvious parts. For production readiness, consider adding a circuit breaker around the external call and a structured retry with exponential backoff. A unit test scaffold is provided at the bottom covering the happy path and the three most likely failure modes.`,
  },

  math: {
    cheap: `Setting up the equation and solving directly: the answer is the result of applying the standard formula. Verify by substituting back.`,

    balanced: `Let me work through this methodically. First I identify the knowns and unknowns. Setting up the governing equation and isolating the variable of interest gives an intermediate expression. Applying the relevant theorem and simplifying yields the closed-form result. A quick sanity check confirms the units and order of magnitude are consistent with expectations.`,

    premium: `This problem sits at the intersection of [topic A] and [topic B], so I will address both the computational and the theoretical angle. Formally, we begin with the axioms and derive the key lemma needed. The proof proceeds by induction on the structure of the input. Solving the recurrence relation gives the exact solution; the asymptotic behaviour follows from the master theorem. I also provide an alternative geometric interpretation that makes the result intuitive. Numerical verification using boundary values confirms the formula. Finally, I note the conditions under which the closed form breaks down and what approximation to use instead.`,
  },

  creative: {
    cheap: `Here is a short piece that captures the core idea with a clear opening image and a punchy closing line.`,

    balanced: `Here is a crafted piece with attention to rhythm and internal consistency. The opening establishes tone and draws the reader in. The middle section develops the central image through contrast and parallel structure. The closing returns to the opening motif with a subtle shift in meaning, giving the piece a sense of resolution. Word choice leans towards the concrete over the abstract to keep the reader grounded.`,

    premium: `Here is a layered piece that works on multiple registers simultaneously. On the surface it tells a straightforward story, but the recurring water imagery gradually accumulates symbolic weight, standing in for memory and the passage of time. The sentence rhythm varies deliberately — long, flowing constructions for moments of reflection, clipped fragments for tension. Character interiority is revealed through action and dialogue rather than direct statement. The ending resists easy resolution, leaving the central ambiguity intact while providing enough closure to feel satisfying. Structural choices include a non-linear timeline and a second-person address that implicates the reader. The piece draws on [genre] conventions while subverting the expected arc in the third act.`,
  },

  general: {
    cheap: `In short: the key point is straightforward once you separate the underlying concept from the surface-level details. The practical takeaway follows directly.`,

    balanced: `Here is a balanced overview. The topic has both a historical dimension and a practical one worth keeping distinct. The commonly held view is [position], but the nuance is that context matters significantly — what holds in one setting may not transfer. The most reliable approach is to start with the first principles and apply them to your specific situation. This matters because the downstream decisions depend heavily on getting the framing right.`,

    premium: `This is a topic worth exploring carefully because the surface answer and the correct answer often diverge. Starting from first principles: [foundational concept]. The mainstream view is [position A], supported by [evidence]. A minority but well-argued position holds [position B], and the tension between the two is productive. The empirical record shows [pattern], with notable exceptions in [context]. Common misconceptions arise from conflating [X] with [Y] — they share vocabulary but differ in mechanism. For practical purposes, the decision framework I would recommend is [framework], applied in the order [sequence]. Caveats: this analysis holds under [conditions]; if [condition] does not apply to you, [alternative]. The literature worth reading further includes [domain-level pointers].`,
  },
};

/** Build a mock response driven by tier depth, not model name. */
export function buildTierResponse(tier: ModelTier, domain: TaskDomain, prefix: string): string {
  return `${prefix} ${RESPONSES[domain][tier]}`;
}

// ---------------------------------------------------------------------------
// Classifier confidence jitter (kept separate — unrelated to model tier)
// ---------------------------------------------------------------------------

/** Add ±5 pp noise to a classifier confidence score. */
export function jitterConfidence(confidence: number): number {
  const noise = (Math.random() - 0.5) * 0.1;
  return parseFloat(Math.min(1, Math.max(0, confidence + noise)).toFixed(2));
}
