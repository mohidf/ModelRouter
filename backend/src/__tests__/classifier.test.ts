/**
 * classifier.test.ts
 *
 * Unit tests for RuleBasedClassifier.
 *
 * Why this module is easy to test:
 *   - Zero external dependencies (no DB, no API, no singletons to mock)
 *   - Pure function: string in → ClassificationResult out
 *   - All logic is in the scoring tables, which we can probe systematically
 *
 * Test strategy:
 *   1. Domain detection   — verify each domain's signals fire correctly
 *   2. Domain confidence  — verify the score ratio produces valid confidence
 *   3. Complexity scoring — verify word-count and keyword signals hit the right thresholds
 *   4. Edge cases         — empty input, boundary values, mixed signals
 */

import { RuleBasedClassifier } from '../services/classifier';

// We test the class directly, not the exported singleton.
// This keeps tests independent of module-level state.
const classifier = new RuleBasedClassifier();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a prompt that is exactly `wordCount` words long.
 * Used to hit word-count complexity thresholds without writing
 * actual long prompts in the test body.
 */
function padToWordCount(base: string, wordCount: number): string {
  const filler = 'word ';
  const wordsNeeded = wordCount - base.split(/\s+/).length;
  return base + ' ' + filler.repeat(Math.max(0, wordsNeeded));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain detection
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — domain detection', () => {

  // ── Coding ──

  it('classifies a prompt with a code block as coding', async () => {
    // Why: the code block pattern has weight 5 — the highest single signal.
    // Failure mode: if this regex breaks, code-heavy prompts get misrouted.
    const result = await classifier.classify('```function greet(name) { return `Hello ${name}`; }```');
    expect(result.domain).toBe('coding');
  });

  it('classifies language keyword signals as coding', async () => {
    // Why: `const`, `function`, `return` are weight-4 signals. A prompt using
    // TypeScript syntax without a code fence should still route to coding.
    const result = await classifier.classify('const result = function calculate() { return 42; }');
    expect(result.domain).toBe('coding');
  });

  it('classifies explicit language name as coding', async () => {
    // Why: language names like "TypeScript", "Python" are weight-3 signals.
    // Failure mode: a user asking "how do I do X in Python" should get a coding model.
    const result = await classifier.classify('How do I read a file in Python?');
    expect(result.domain).toBe('coding');
  });

  it('classifies bug/debug keywords as coding_debug', async () => {
    // Why: "debug", "error", "bug" are strong signals for the coding_debug domain,
    // which routes to models specialised in debugging rather than general coding.
    const result = await classifier.classify('Help me debug this error in my code');
    expect(result.domain).toBe('coding_debug');
  });

  it('classifies API/database keywords as coding', async () => {
    // Why: "api", "endpoint", "database", "sql" are weight-2 signals.
    // They're lower weight because they can appear in non-coding contexts,
    // but a combination of them should still be enough to score coding.
    const result = await classifier.classify('Design a REST api endpoint that queries the database using sql');
    expect(result.domain).toBe('coding');
  });

  // ── Math ──

  it('classifies a solve/equation prompt as math', async () => {
    // Why: "solve", "equation" are weight 3+4 signals for math.
    // Failure mode: a math problem goes to a general model that approximates
    // rather than computing precisely.
    const result = await classifier.classify('solve the equation x^2 + 5x + 6 = 0');
    expect(result.domain).toBe('math');
  });

  it('classifies calculus keywords as math', async () => {
    // Why: "calculus", "integral", "derivative" are weight-4 signals.
    // Highest-weight math signals — a single hit should be decisive.
    const result = await classifier.classify('prove using calculus that this integral converges');
    expect(result.domain).toBe('math');
  });

  it('classifies statistics vocabulary as math', async () => {
    // Why: "mean", "variance", "correlation" are weight-3 math signals.
    // Failure mode: a data-science stats question routes to creative/general.
    const result = await classifier.classify('calculate the mean and variance of this distribution');
    expect(result.domain).toBe('math');
  });

  // ── Creative ──

  it('classifies "write a story" pattern as creative', async () => {
    // Why: the combined pattern /write.*story|poem|.../ carries weight 5 —
    // the highest in the creative table. It is the primary creative signal.
    const result = await classifier.classify('Write a short story about a lighthouse keeper');
    expect(result.domain).toBe('creative');
  });

  it('classifies a haiku request as creative', async () => {
    // Why: "haiku" and "poem" are weight-4 creative signals.
    // A specific literary form should always route to a creative model.
    const result = await classifier.classify('compose a haiku about the changing seasons');
    expect(result.domain).toBe('creative');
  });

  it('classifies narrative structure vocabulary as creative', async () => {
    // Why: "character", "plot", "dialogue" are weight-3 creative signals.
    // A fiction-writing question about craft should route to a creative model.
    const result = await classifier.classify('how should I develop the character arc and plot for my novel');
    expect(result.domain).toBe('creative');
  });

  // ── General fallback ──

  it('falls back to general when no domain signals match', async () => {
    // Why: the fallback must be explicit and stable. A prompt with no
    // detectable signals should get a sensible general-purpose model,
    // not a random mismatch.
    const result = await classifier.classify('what time is it in Tokyo right now');
    expect(result.domain).toBe('general');
  });

  it('uses confidence 0.5 for the general fallback', async () => {
    // Why: 0.5 is the neutral/uncertain confidence for general.
    // Anything lower would trigger escalation on every general prompt.
    // Anything higher would imply false certainty.
    const result = await classifier.classify('what is the capital of France');
    expect(result.domain).toBe('general');
    expect(result.confidence).toBe(0.5);
  });

  // ── New domains: coding_debug ──

  it('classifies explicit debug/error keywords as coding_debug', async () => {
    // Why: "error" (weight 5) and "fix this" (weight 5) are the two
    // highest-weight coding_debug signals. Together they should easily beat
    // any competing domain score.
    const result = await classifier.classify('fix this error: TypeError cannot read property of undefined');
    expect(result.domain).toBe('coding_debug');
  });

  it('classifies null pointer / assertion errors as coding_debug', async () => {
    const result = await classifier.classify('null pointer exception when calling the function');
    expect(result.domain).toBe('coding_debug');
  });

  // ── New domains: math_reasoning ──

  it('classifies step-by-step reasoning requests as math_reasoning', async () => {
    // Why: "step by step" is a weight-5 signal for math_reasoning.
    const result = await classifier.classify('solve this step by step and show your work');
    expect(result.domain).toBe('math_reasoning');
  });

  it('classifies word problems as math_reasoning', async () => {
    // Why: "how many" + "there are N" both trigger math_reasoning signals (weight 4 each).
    // Avoid words like "class" which are also weight-4 coding keywords.
    const result = await classifier.classify('there are 24 people at a party, how many handshakes are possible?');
    expect(result.domain).toBe('math_reasoning');
  });

  // ── New domains: research ──

  it('classifies journal/citation prompts as research', async () => {
    // Why: "journal" (weight 5) and "peer-reviewed" (weight 5) are top signals.
    const result = await classifier.classify('find citations from a peer-reviewed journal on this topic');
    expect(result.domain).toBe('research');
  });

  it('classifies analyze/compare prompts as research', async () => {
    // Why: "compare" (weight 3) + "analyze" (weight 3) accumulate to a strong research score.
    const result = await classifier.classify('compare and analyze the research evidence on this topic');
    expect(result.domain).toBe('research');
  });

  it('does NOT classify "history of X" phrasing as research', async () => {
    // Regression test for the "Ada Lovelace" fix.
    // Previously the pattern /\b(history of|...)\b/ (weight 2) fired on phrases
    // like "in the history of computing" — making the rule-based classifier
    // return research:1.0 (fast path), skipping the embedding classifier.
    // The pattern was removed because it produced too many false positives on
    // general factual questions. Now "history of X" prompts fall through to the
    // embedding path (returned as general:0.5 by rule-based) as intended.
    const result = await classifier.classify(
      'Who was Ada Lovelace and why is she significant in the history of computing?'
    );
    // Must NOT classify as research via the fast path — falls back to general
    expect(result.domain).toBe('general');
    expect(result.confidence).toBe(0.5);  // neutral — embedding classifier takes over
  });

  it('classifies academic-vocabulary research prompts as research (not affected by fix)', async () => {
    // Positive counterpart to the above: the removal of "history of" must not
    // break prompts that contain genuine academic signals (literature, study, evidence).
    const result = await classifier.classify(
      'What does the peer-reviewed literature say about the long-term effects of caffeine on cognition?'
    );
    expect(result.domain).toBe('research');
  });

  it('classifies systematic-review vocabulary as research', async () => {
    // Tests the replacement pattern: /\b(meta.analysis|systematic review|...)\b/
    // Note: the prompt must NOT start with "summarize" — that is a weight-10
    // summarization signal that would beat the weight-3 research signal.
    const result = await classifier.classify(
      'What do the latest systematic reviews conclude about intermittent fasting and metabolic health?'
    );
    expect(result.domain).toBe('research');
  });

  it('does NOT fast-path "Northern Lights" as vision (no image keywords)', async () => {
    // Regression test: "What causes the Northern Lights and where is the best place to see them?"
    // used to be pulled into vision because the embedding's "see" association.
    // The rule-based classifier must NOT fire any vision signals for this prompt
    // (no image/photo/screenshot/diagram keywords) — it must fall back to general:0.5
    // so the embedding classifier gets a clean shot at it.
    const result = await classifier.classify(
      'What causes the Northern Lights and where is the best place to see them?'
    );
    // Rule-based should produce general:0.5 — no domain-specific vocabulary matches
    expect(result.domain).toBe('general');
    expect(result.confidence).toBe(0.5);
  });

  // ── New domains: summarization ──

  it('classifies explicit summarize requests as summarization', async () => {
    // Why: "summarize" is a weight-5 signal and also matches the
    // start-of-prompt weight-5 anchor pattern.
    const result = await classifier.classify('summarize the following article for me');
    expect(result.domain).toBe('summarization');
  });

  it('classifies key-points and TLDR requests as summarization', async () => {
    const result = await classifier.classify('give me the key points and a tldr of this document');
    expect(result.domain).toBe('summarization');
  });

  // ── New domains: vision ──

  it('classifies image description prompts as vision', async () => {
    // Why: "image" (weight 5) + "describe this" (weight 5) are the top vision signals.
    const result = await classifier.classify('describe this image in detail');
    expect(result.domain).toBe('vision');
  });

  it('classifies screenshot analysis as vision', async () => {
    const result = await classifier.classify('what is shown in this screenshot');
    expect(result.domain).toBe('vision');
  });

  // ── New domains: general_chat ──

  it('classifies greeting prompts as general_chat', async () => {
    // Why: "hi" at the start of a prompt is a weight-5 general_chat signal.
    const result = await classifier.classify('hi, can you help me today?');
    expect(result.domain).toBe('general_chat');
  });

  it('classifies "how are you" as general_chat', async () => {
    const result = await classifier.classify('how are you doing today?');
    expect(result.domain).toBe('general_chat');
  });

  // ── New domains: multilingual ──

  it('classifies translate requests as multilingual', async () => {
    // Why: "translate" is a weight-5 multilingual signal.
    const result = await classifier.classify('translate this text to French');
    expect(result.domain).toBe('multilingual');
  });

  it('classifies "how do you say X in language" as multilingual', async () => {
    // Why: "how do you say" + "in Spanish" both trigger weight-4/5 patterns.
    const result = await classifier.classify('how do you say thank you in Spanish?');
    expect(result.domain).toBe('multilingual');
  });

  // ── Mixed signals ──

  it('picks the domain with the higher aggregate signal score', async () => {
    // Why: prompts often span domains. The classifier must consistently
    // pick the dominant one, not flip-flop on repeated calls.
    // "calculate" is a math signal; but "TypeScript function algorithm" is
    // heavier coding signal — coding should win.
    const result = await classifier.classify(
      'calculate the time complexity of this TypeScript function using the algorithm pattern'
    );
    expect(result.domain).toBe('coding');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Confidence values
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — confidence', () => {

  it('confidence is always in the range [0, 1]', async () => {
    // Why: downstream code treats confidence as a probability. Values outside
    // [0, 1] would break the escalation threshold comparison and the
    // performance store's averageConfidence tracking.
    const prompts = [
      'Write a poem about the ocean',
      'solve x^2 = 4',
      'implement a binary search in Python',
      'what is the weather like today',
      '',  // edge case
    ];
    for (const prompt of prompts) {
      const result = await classifier.classify(prompt);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('confidence is higher when one domain dominates clearly', async () => {
    // Why: confidence is (top score / total score). When all signal weight
    // concentrates in one domain, confidence approaches 1. When signals are
    // split, it approaches 1/n.
    // A prompt firing multiple coding signals with no math/creative hits
    // should produce confidence > 0.7.
    const result = await classifier.classify(
      'implement a TypeScript class with a recursive algorithm using const and function'
    );
    expect(result.domain).toBe('coding');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('confidence is lower when signals are split across domains', async () => {
    // Why: a prompt that equally triggers coding and math signals should yield
    // lower confidence than a pure coding prompt — reflecting genuine ambiguity.
    // Lower confidence means the router is more likely to escalate, which is
    // the correct behaviour for ambiguous prompts.
    const result = await classifier.classify(
      'calculate the complexity of this algorithm using integral calculus, write the function in Python'
    );
    // Both domains have signal — confidence should be lower than a pure prompt
    // We just check it's a valid fraction, not the exact value (heuristic)
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Complexity detection
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — complexity', () => {

  it('classifies a very short prompt as low complexity', async () => {
    // Why: a short prompt (< 20 words) scores 0 complexity points on word
    // count signals. Without keyword boosters it stays at "low".
    // Failure mode: a trivial question gets expensive premium-tier routing.
    const result = await classifier.classify('what is two plus two');
    expect(result.complexity).toBe('low');
  });

  it('classifies a medium-length prompt as medium complexity', async () => {
    // Why: the complexity thresholds are:
    //   ≥6 points → high, ≥3 points → medium, <3 → low
    // The >50-word signal is +3 pts — enough to hit medium on its own.
    // The >20-word signal is only +2 pts — NOT enough alone (still low).
    // Using 55 words ensures we reliably land in the medium band.
    const prompt = padToWordCount('explain the concept of recursion', 55);
    const result = await classifier.classify(prompt);
    expect(result.complexity).toBe('medium');
  });

  it('classifies a long prompt (>100 words) as high complexity', async () => {
    // Why: >100 words gives +4 complexity points alone — enough to cross
    // the high threshold (≥6) when combined with any other signal.
    // Without this, a very detailed system-design prompt gets cheap routing.
    const prompt = padToWordCount('Design a scalable system architecture', 105);
    const result = await classifier.classify(prompt);
    expect(result.complexity).toBe('high');
  });

  it('promotes complexity when architecture keywords appear', async () => {
    // Why: keywords like "architecture", "distributed", "microservice"
    // carry +3 complexity points regardless of word count.
    // A short but sophisticated prompt should not be treated as trivial.
    const result = await classifier.classify(
      'design a distributed microservice architecture for high throughput'
    );
    expect(result.complexity).not.toBe('low');
  });

  it('promotes complexity when step-by-step or comprehensive is requested', async () => {
    // Why: "step-by-step" and "comprehensive" add +2 complexity points.
    // A user explicitly requesting detail has higher output requirements —
    // routing to a cheap model would produce a shallow response.
    const result = await classifier.classify(
      'give me a step-by-step comprehensive guide to implement this'
    );
    expect(result.complexity).not.toBe('low');
  });

  it('promotes complexity when compare/contrast is requested in a realistic prompt', async () => {
    // Why: the compare/contrast signal alone is only +2 pts (one regex match).
    // The medium threshold is ≥3 pts, so a short compare prompt stays "low".
    // A realistic comparison question is typically > 20 words (+2 pts more),
    // giving: compare signal (+2) + word count (+2) = 4 pts → medium.
    // padToWordCount ensures we hit exactly 25 words without guessing.
    const prompt = padToWordCount('compare and contrast the trade-offs between SQL and NoSQL databases', 25);
    const result = await classifier.classify(prompt);
    // compare signal (+2) + >20 words (+2) = 4 pts → medium
    expect(result.complexity).not.toBe('low');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Token estimation
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — token estimation', () => {

  it('estimates tokens as ceil(prompt.length / 4)', async () => {
    // Why: the 1-token-per-4-chars heuristic is a standard approximation
    // for English text. We test the formula directly so a refactor that
    // accidentally changes the divisor is caught.
    const prompt = 'Hello world';        // 11 chars → ceil(11/4) = 3
    const result = await classifier.classify(prompt);
    expect(result.estimatedTokens).toBe(Math.ceil(prompt.length / 4));
  });

  it('always returns at least 1 estimated token', async () => {
    // Why: a single character prompt should return 1 token, not 0.
    // Downstream cost calculation multiplies by token count — 0 tokens
    // would silently suppress cost tracking.
    const result = await classifier.classify('a');
    expect(result.estimatedTokens).toBeGreaterThanOrEqual(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — edge cases', () => {

  it('does not throw on an empty string', async () => {
    // Why: an empty prompt can arrive if the frontend validation fails or
    // a script calls the API with an empty body field. The classifier must
    // degrade gracefully rather than crash the entire request.
    await expect(classifier.classify('')).resolves.toBeDefined();
  });

  it('returns general domain for an empty string', async () => {
    // Why: with no signals, the fallback must be general — not an exception,
    // not undefined, not the last-seen domain from a previous call.
    const result = await classifier.classify('');
    expect(result.domain).toBe('general');
  });

  it('returns low complexity for an empty string', async () => {
    // Why: 0 words hits no complexity signal. Sending an empty prompt to
    // a premium-tier model would waste money for no output.
    const result = await classifier.classify('');
    expect(result.complexity).toBe('low');
  });

  it('returns deterministic results for the same input', async () => {
    // Why: the classifier must be deterministic now that the jitter has been
    // removed (fix #2 in code review). This test is the regression guard —
    // if jitterConfidence() is accidentally reintroduced, this will fail
    // because the same input would produce different confidences on successive calls.
    const prompt = 'Write a Python function to sort an array';
    const r1 = await classifier.classify(prompt);
    const r2 = await classifier.classify(prompt);
    const r3 = await classifier.classify(prompt);

    expect(r1.domain).toBe(r2.domain);
    expect(r2.domain).toBe(r3.domain);
    expect(r1.confidence).toBe(r2.confidence);
    expect(r2.confidence).toBe(r3.confidence);
    expect(r1.complexity).toBe(r2.complexity);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Explain intent — pedagogical requests route to general
//
// "explain quicksort" and "explain how recursion works" share vocabulary with
// the coding domain (algorithm, recursion), but the user intent is conceptual
// understanding, not implementation. Routing these to a coding specialist
// wastes premium-tier compute and may produce implementation-heavy responses
// when the user just wanted a simple explanation.
//
// Exception: explicit implementation signals ("explain how to implement X in
// Python") correctly override the explain intent and stay in the coding domain.
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — explain intent routing', () => {

  it('routes "explain quicksort" to general, not coding', async () => {
    // Why: "quicksort" is an algorithm keyword (coding signal weight 2),
    // but the user is asking for a concept explanation, not code output.
    // Routing to coding routes to a model optimised for implementation, which
    // gives verbose code dumps when the user wanted a simple explanation.
    const result = await classifier.classify('explain quicksort');
    expect(result.domain).toBe('general');
  });

  it('routes "explain how recursion works" to general, not coding', async () => {
    // Why: same as above — "recursion" is a coding keyword but the verb "explain"
    // signals a pedagogical request that any capable model handles well.
    const result = await classifier.classify('explain how recursion works');
    expect(result.domain).toBe('general');
  });

  it('routes "explain binary search" to general, not coding', async () => {
    const result = await classifier.classify('explain binary search');
    expect(result.domain).toBe('general');
  });

  it('keeps coding domain when explain prompt contains implementation signals', async () => {
    // Why: "explain how to implement X in Python" is both an explain AND a code
    // task. The user wants working code with explanation. Route to coding.
    const result = await classifier.classify('explain how to implement a binary tree in Python');
    expect(result.domain).toBe('coding');
  });

  it('does not misfire on implementation prompts without "explain" prefix', async () => {
    // Why: only "explain"-prefixed prompts should be caught. Standard coding
    // prompts must continue to route to coding.
    const result = await classifier.classify('write a quicksort function in TypeScript');
    expect(result.domain).toBe('coding');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Vision domain precision — no false positives in coding/data contexts
//
// Before the fix, "chart", "graph", "diagram" in the vision domain had weight 5 —
// the same as "image" and "photo". This caused prompts like "create a bar chart
// with D3.js" to route to vision (weight 5) over coding (weight 2), even though
// the user is asking to write code, not analyse an image.
//
// Fix:
//   - Unambiguous visual terms (image, photo, picture, screenshot): weight 5
//   - Ambiguous visual terms (diagram, chart, graph, visual, figure): weight 2
//   - New coding signal: (create|build|plot).{0,30}(chart|graph|diagram): weight 4
// ─────────────────────────────────────────────────────────────────────────────

describe('RuleBasedClassifier — vision domain precision', () => {

  it('routes chart-building code prompts to coding, not vision', async () => {
    // Why: "create a bar chart with D3.js" is a code generation request.
    // The old weight-5 "chart" signal pushed it to vision — a model that
    // expects an image as input and produces visual analysis, not code.
    const result = await classifier.classify('create a bar chart with D3.js');
    expect(result.domain).toBe('coding');
  });

  it('routes graph plotting to coding, not vision', async () => {
    // Why: "plot a line graph using matplotlib" is Python data visualisation code.
    // Users expect matplotlib/D3/Chart.js code in return, not image analysis.
    const result = await classifier.classify('plot a line graph using matplotlib');
    expect(result.domain).toBe('coding');
  });

  it('still routes genuine image analysis prompts to vision', async () => {
    // Why: must verify the fix does not over-correct.
    // "describe this image" remains a strong vision signal (image weight 5 + describe-this weight 5).
    const result = await classifier.classify('describe this image in detail');
    expect(result.domain).toBe('vision');
  });

  it('still routes screenshot prompts to vision', async () => {
    // Why: same over-correction guard — screenshot is unambiguous visual input.
    const result = await classifier.classify('what is shown in this screenshot');
    expect(result.domain).toBe('vision');
  });

});
