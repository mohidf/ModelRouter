import type { ClassificationResult, TaskComplexity, TaskDomain } from '../providers/types';

// ---------------------------------------------------------------------------
// Public interface — swap this implementation for an LLM-based one by
// creating a new class that satisfies IClassifier and reassigning `classifier`.
// ---------------------------------------------------------------------------

export interface IClassifier {
  classify(prompt: string): Promise<ClassificationResult>;
}

// ---------------------------------------------------------------------------
// Scoring primitives
// ---------------------------------------------------------------------------

interface Signal {
  pattern: RegExp;
  weight: number;
}

interface ComplexitySignal {
  test: (lower: string, wordCount: number) => boolean;
  points: number;
}

// Only the three specific domains are scored; 'general' is the explicit fallback.
type SpecificDomain = Exclude<TaskDomain, 'general'>;

const DOMAIN_SIGNALS: Record<SpecificDomain, Signal[]> = {
  coding: [
    { pattern: /```[\s\S]*```|`[^`\n]+`/,                                                    weight: 5 },
    { pattern: /\b(function|class|const|let|var|def|return|import|export|interface)\b/,      weight: 4 },
    { pattern: /\b(bug|debug|error|fix|refactor|implement|deploy|compile|runtime)\b/i,       weight: 3 },
    { pattern: /\b(api|endpoint|database|sql|schema|repository|service|middleware)\b/i,      weight: 2 },
    { pattern: /\b(typescript|javascript|python|java|rust|golang|kotlin|swift|bash|php)\b/i, weight: 3 },
    { pattern: /\b(algorithm|array|hash|tree|graph|sort|recursion|complexity)\b/i,           weight: 2 },
  ],
  math: [
    { pattern: /\b(solve|calculate|compute|evaluate|simplify|prove|derive|integrate)\b/i,     weight: 3 },
    { pattern: /\b(equation|formula|integral|derivative|matrix|vector|polynomial|limit)\b/i,  weight: 4 },
    { pattern: /\b(algebra|calculus|geometry|statistics|probability|arithmetic|trigonometry)\b/i, weight: 4 },
    { pattern: /\d+\s*[+\-*\/^]\s*\d+|[a-z]\s*=\s*[\d(]/i,                                  weight: 3 },
    { pattern: /\b(sum|product|factorial|prime|modulo|logarithm|exponent|coefficient)\b/i,    weight: 3 },
    { pattern: /\b(mean|median|variance|standard deviation|correlation|regression)\b/i,       weight: 3 },
  ],
  creative: [
    { pattern: /\b(write|compose|craft|draft|create)\b.*\b(story|poem|essay|song|script|letter)\b/i, weight: 5 },
    { pattern: /\b(story|poem|haiku|sonnet|limerick|narrative|fiction|novel|screenplay)\b/i,         weight: 4 },
    { pattern: /\b(character|plot|setting|theme|metaphor|imagery|dialogue|stanza)\b/i,               weight: 3 },
    { pattern: /\b(creative|imaginative|artistic|expressive|original|inventive)\b/i,                 weight: 2 },
    { pattern: /\b(lyrics|verse|chorus|rhyme|rhythm|prose|tone|voice)\b/i,                          weight: 3 },
  ],
};

const COMPLEXITY_SIGNALS: ComplexitySignal[] = [
  { test: (_l, wc) => wc > 100,                                                                                      points: 4 },
  { test: (_l, wc) => wc > 50,                                                                                       points: 3 },
  { test: (_l, wc) => wc > 20,                                                                                       points: 2 },
  { test: (l) => /\b(architecture|distributed|concurrent|scalab|optimis|optimiz|microservice)\b/.test(l),            points: 3 },
  { test: (l) => /\b(step.by.step|in detail|comprehensive|thorough|end.to.end|production.ready)\b/.test(l),         points: 2 },
  { test: (l) => /\b(compare|contrast|trade.?off|pros.and.cons|evaluate|analyse|analyze)\b/.test(l),                points: 2 },
  { test: (l) => /\b(proof|theorem|derive|formal(ly)?|rigorously)\b/.test(l),                                       points: 2 },
  { test: (l) => /\b(implement|build|design|architect|create)\b/.test(l),                                           points: 1 },
];

// ---------------------------------------------------------------------------
// Rule-based implementation
// ---------------------------------------------------------------------------

export class RuleBasedClassifier implements IClassifier {
  async classify(prompt: string): Promise<ClassificationResult> {
    const { domain, confidence } = this.scoreDomain(prompt);
    const complexity = this.scoreComplexity(prompt);
    const estimatedTokens = Math.ceil(prompt.length / 4);

    return { domain, complexity, confidence, estimatedTokens };
  }

  private scoreDomain(prompt: string): { domain: TaskDomain; confidence: number } {
    const specificDomains: SpecificDomain[] = ['coding', 'math', 'creative'];

    const scores = specificDomains.map((domain) => ({
      domain,
      score: this.sumSignals(prompt, DOMAIN_SIGNALS[domain]),
    }));

    const top = scores.reduce((a, b) => (a.score >= b.score ? a : b));

    // No specific domain matched — fall back to general with neutral confidence
    if (top.score === 0) {
      return { domain: 'general', confidence: 0.5 };
    }

    const total = scores.reduce((sum, s) => sum + s.score, 0);
    const confidence = parseFloat((top.score / total).toFixed(2));

    return { domain: top.domain, confidence };
  }

  private scoreComplexity(prompt: string): TaskComplexity {
    const lower = prompt.toLowerCase();
    const wordCount = prompt.trim().split(/\s+/).length;

    const points = COMPLEXITY_SIGNALS.reduce(
      (sum, signal) => sum + (signal.test(lower, wordCount) ? signal.points : 0),
      0
    );

    if (points >= 6) return 'high';
    if (points >= 3) return 'medium';
    return 'low';
  }

  private sumSignals(prompt: string, signals: Signal[]): number {
    return signals.reduce(
      (sum, { pattern, weight }) => sum + (pattern.test(prompt) ? weight : 0),
      0
    );
  }
}

export const classifier: IClassifier = new RuleBasedClassifier();
