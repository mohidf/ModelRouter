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

// 'general' remains the explicit fallback — all other 10 domains are scored.
type SpecificDomain = Exclude<TaskDomain, 'general'>;

const DOMAIN_SIGNALS: Record<SpecificDomain, Signal[]> = {
  // ── coding: implementation, language keywords, code blocks ───────────────
  coding: [
    { pattern: /```[\s\S]*```|`[^`\n]+`/,                                                    weight: 5 },
    { pattern: /\b(function|class|const|let|var|def|return|import|export|interface)\b/,      weight: 4 },
    { pattern: /\b(implement|build|write|create)\b.{0,30}\b(function|api|service|class|component|module)\b/i, weight: 4 },
    // Data visualisation and chart-building in code — prevents these from routing to vision.
    // "create a bar chart with D3.js", "plot a line graph using matplotlib" → coding.
    { pattern: /\b(create|build|write|generate|render|plot)\b.{0,30}\b(chart|graph|plot|diagram|visualization)\b/i, weight: 4 },
    { pattern: /\b(typescript|javascript|python|java|rust|golang|kotlin|swift|bash|php)\b/i, weight: 3 },
    { pattern: /\b(algorithm|array|hash|tree|graph|sort|recursion|complexity)\b/i,           weight: 2 },
    { pattern: /\b(api|endpoint|database|sql|schema|repository|service|middleware)\b/i,      weight: 2 },
  ],

  // ── coding_debug: error messages, stack traces, debugging ────────────────
  coding_debug: [
    { pattern: /\b(error|exception|traceback|stack.?trace|crash|segfault)\b/i,                     weight: 5 },
    { pattern: /\b(why.{0,20}(not working|failing|broken|wrong)|fix this|debug|doesn'?t work)\b/i, weight: 5 },
    { pattern: /at\s+\w+[\.\(]\w+|File ".*", line \d+|TypeError:|ValueError:|SyntaxError:/,        weight: 5 },
    { pattern: /\b(bug|unexpected (output|behavior|result)|incorrect|wrong output)\b/i,            weight: 4 },
    { pattern: /\b(test fail|assertion error|null pointer|undefined is not|cannot read)\b/i,       weight: 4 },
    // Behavioral symptoms: "never updates/loads/renders" and "expected X but got Y"
    { pattern: /\b(never (updates?|renders?|loads?|fires?|triggers?|shows?|runs?))\b/i,            weight: 4 },
    { pattern: /\b(expected.{0,40}but (got|received|seeing)|returns? (wrong|incorrect|empty|null|undefined))\b/i, weight: 4 },
  ],

  // ── math: equations, formulas, symbolic computation ──────────────────────
  math: [
    { pattern: /\b(equation|formula|integral|derivative|matrix|vector|polynomial|limit)\b/i,             weight: 4 },
    { pattern: /\b(algebra|calculus|geometry|statistics|probability|arithmetic|trigonometry)\b/i,        weight: 4 },
    { pattern: /\b(gradient|steepest.descent|directional.derivative|jacobian|hessian|saddle.point)\b/i, weight: 4 },
    { pattern: /\b(solve|calculate|compute|evaluate|simplify|prove|derive|integrate)\b/i,               weight: 3 },
    { pattern: /\d+\s*[+\-*\/^]\s*\d+|[a-z]\s*=\s*[\d(]/i,                                            weight: 3 },
    { pattern: /\b(sum|product|factorial|prime|modulo|logarithm|exponent|coefficient)\b/i,              weight: 3 },
    { pattern: /\b(mean|median|variance|standard deviation|correlation|regression)\b/i,                 weight: 3 },
  ],

  // ── math_reasoning: word problems, step-by-step logical deduction ─────────
  math_reasoning: [
    { pattern: /\b(step.by.step|chain of thought|reason through|work through|show your work)\b/i, weight: 5 },
    { pattern: /\b(how many|if .{5,40} how|there are \d+|total number of)\b/i,                   weight: 4 },
    { pattern: /\b(logically|deduc|infer|conclud|therefore|given that|it follows)\b/i,           weight: 3 },
    { pattern: /\b(word problem|scenario|probability that|chances of|expected value)\b/i,         weight: 4 },
    { pattern: /\b(proof by|by induction|contrapositive|lemma|theorem|conjecture)\b/i,           weight: 3 },
  ],

  // ── creative: stories, poems, scripts, imaginative writing ───────────────
  creative: [
    { pattern: /\b(write|compose|craft|draft|create)\b.*\b(story|poem|essay|song|script|letter)\b/i, weight: 5 },
    { pattern: /\b(story|poem|haiku|sonnet|limerick|narrative|fiction|novel|screenplay)\b/i,         weight: 4 },
    { pattern: /\b(character|plot|setting|theme|metaphor|imagery|dialogue|stanza)\b/i,               weight: 3 },
    { pattern: /\b(lyrics|verse|chorus|rhyme|rhythm|prose|tone|voice)\b/i,                          weight: 3 },
    { pattern: /\b(creative|imaginative|artistic|expressive|original|inventive|brainstorm)\b/i,     weight: 2 },
  ],

  // ── research: analysis, synthesis, comparison, citations ─────────────────
  research: [
    { pattern: /\b(research|study|investigate|findings|literature|methodology|hypothesis)\b/i,         weight: 4 },
    { pattern: /\b(journal|paper|publication|citation|survey|evidence|peer.reviewed)\b/i,              weight: 5 },
    { pattern: /\b(compare|contrast|analyze|analyse|synthesize|evaluate|assess|examine)\b/i,          weight: 3 },
    { pattern: /\b(what.{0,20}difference between|pros and cons|advantages.{0,20}disadvantages)\b/i,   weight: 4 },
    // Require explicitly academic vocabulary — "history of" alone is too broad and catches
    // general factual questions like "in the history of computing".
    { pattern: /\b(meta.?analys[ie]s|systematic reviews?|literature review|empirical studies|empirical study|academic consensus)\b/i, weight: 3 },
    // Analytical balance / evidence evaluation — "balanced look at whether X is more Y"
    { pattern: /\b(balanced (look|view|assessment|perspective|analysis)|for and against|whether .{0,40}(more|less|better|worse|effective|productive|beneficial))\b/i, weight: 3 },
  ],

  // ── summarization: compression, extraction, TLDR ─────────────────────────
  summarization: [
    { pattern: /\b(summarize|summarise|summary|tl;?dr|recap|condense|shorten|compress)\b/i, weight: 5 },
    { pattern: /\b(key points?|main (points?|ideas?|takeaways?)|bullet points?)\b/i,        weight: 4 },
    { pattern: /\b(overview|synopsis|abstract|outline|highlights?)\b/i,                     weight: 3 },
    { pattern: /^(summarize|give me a summary|tldr|recap|what are the main)/i,              weight: 5 },
  ],

  // ── vision: images, diagrams, visual content ─────────────────────────────
  vision: [
    // Unambiguous visual input terms — only meaningfully appear when discussing
    // actual images or screenshots submitted to the model.
    { pattern: /\b(image|photo|picture|screenshot)\b/i,                                             weight: 5 },
    // Ambiguous visual terms — "chart", "graph", "diagram" appear frequently in
    // coding/data contexts ("create a chart with D3", "a UML diagram"). Lower weight
    // prevents false positives when paired with coding signals.
    { pattern: /\b(diagram|chart|graph|visual|figure)\b/i,                                          weight: 2 },
    { pattern: /\b(describe (this|the)|what('s| is) in (this|the)|analyze this image|caption)\b/i,  weight: 5 },
    { pattern: /\b(look at|see|observe|identify|detect|recognize) .{0,20}(image|picture|photo)\b/i, weight: 4 },
    { pattern: /\b(ocr|extract text from|read the|handwriting)\b/i,                                 weight: 4 },
  ],

  // ── general_chat: conversational, greetings, simple questions ────────────
  general_chat: [
    { pattern: /^(hi|hello|hey|good (morning|afternoon|evening)|what'?s up|howdy)\b/i,      weight: 5 },
    { pattern: /\b(how are you|how'?s it going|what do you think|nice to meet)\b/i,        weight: 4 },
    { pattern: /^(can you|could you|would you|please) (help|tell|explain|show)/i,          weight: 2 },
    { pattern: /\b(just wondering|curious about|quick question|random question)\b/i,       weight: 3 },
    { pattern: /\b(recommend|suggest|opinion|thoughts on|what'?s your|do you like)\b/i,   weight: 2 },
  ],

  // ── multilingual: translation, non-English, language requests ────────────
  multilingual: [
    { pattern: /\b(translate|translation|in (french|spanish|german|chinese|japanese|arabic|hindi|portuguese|russian|korean))\b/i, weight: 5 },
    { pattern: /\b(en español|auf deutsch|en français|em português|in italiano)\b/i,                                             weight: 5 },
    { pattern: /\b(how do you say|what is .{0,20} in|language (learning|lesson|practice))\b/i,                                  weight: 4 },
    // Non-ASCII character dominance — likely non-English input
    { pattern: /[\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F]{4,}/, weight: 4 },
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
    // Pedagogical intent check: "explain X" prompts route to general rather than
    // the X domain, because the user wants a conceptual explanation, not specialised
    // model output. Exception: explicit implementation signals keep the specialist domain.
    if (this.isExplainIntent(prompt)) {
      return { domain: 'general', confidence: 0.5 };
    }

    // Derive from DOMAIN_SIGNALS keys so adding a new entry automatically includes it.
    const specificDomains = Object.keys(DOMAIN_SIGNALS) as SpecificDomain[];

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

  /**
   * Returns true when the prompt is a pure conceptual/pedagogical request
   * ("explain quicksort", "explain how recursion works") that should be routed
   * to a general-purpose model rather than a domain specialist.
   *
   * Implementation signals (implement, write, build, create + language name)
   * override the explain intent — "explain how to implement X in Python"
   * is a legitimate coding request that should stay in the coding domain.
   */
  private isExplainIntent(prompt: string): boolean {
    const EXPLAIN_START  = /^\s*explain\b/i;
    const IMPL_SIGNALS   = /\b(implement|write|build|create|a function|a class|the code for|in python|in typescript|in javascript|in java|in go|in rust|in kotlin|in swift)\b/i;
    return EXPLAIN_START.test(prompt) && !IMPL_SIGNALS.test(prompt);
  }

  private sumSignals(prompt: string, signals: Signal[]): number {
    return signals.reduce(
      (sum, { pattern, weight }) => sum + (pattern.test(prompt) ? weight : 0),
      0
    );
  }
}

export const classifier: IClassifier = new RuleBasedClassifier();
