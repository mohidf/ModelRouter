#!/usr/bin/env ts-node
/**
 * benchmark.ts
 *
 * Runs 50 labeled prompts through the live router and measures:
 *   - Classification accuracy per domain (overall + easy/hard split)
 *   - Average latency vs GPT-4o hypothetical baseline
 *   - Cost savings vs always using GPT-4o
 *   - Escalation rate and strategy mode distribution
 *
 * Prerequisites:
 *   - Backend running at http://localhost:3000 (or $BENCHMARK_URL)
 *   - OPENAI_API_KEY set in backend/.env
 *
 * Usage:
 *   cd backend
 *   ts-node src/scripts/benchmark.ts
 *   BENCHMARK_URL=http://staging.example.com ts-node src/scripts/benchmark.ts
 *
 * Expected runtime: ~3–6 minutes (50 sequential API calls)
 * Expected cost:    ~$0.01–0.05 (mostly cheap-tier models)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL      = process.env.BENCHMARK_URL ?? 'http://localhost:3000';
const MAX_TOKENS    = 256;   // short responses — we're testing routing, not generation quality
const REQUEST_DELAY = 500;   // ms between calls — avoids hitting rate limiter (50/hr default)

/**
 * GPT-4o list prices used as the "always use GPT-4o" baseline.
 * These are USD per 1 M tokens as of early 2025.
 */
const GPT4O_INPUT_PER_1M  = 2.50;
const GPT4O_OUTPUT_PER_1M = 10.00;

// ---------------------------------------------------------------------------
// Test suite — 50 labeled prompts
//
// Difficulty key:
//   easy — contains at least one keyword from the rule-based signal table;
//          rule-based classifier should classify this correctly on its own.
//   hard — no domain keywords; relies on the embedding path for accuracy.
//          If you see "hard" prompts misclassified, the embedding anchors need tuning.
// ---------------------------------------------------------------------------

type Domain     = 'coding' | 'math' | 'creative' | 'general';
type Difficulty = 'easy' | 'hard';

interface TestCase {
  prompt:         string;
  expectedDomain: Domain;
  difficulty:     Difficulty;
}

const TEST_CASES: TestCase[] = [
  // ── Coding — easy (keywords: TypeScript, function, SQL, refactor, algorithm, etc.) ──
  { prompt: 'Write a TypeScript function that sorts an array of objects by a given key',                  expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'Debug this Python error: NameError name x is not defined on line 12',                       expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'Implement a caching layer for a Node.js REST API endpoint using Redis',                      expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'What is the difference between O(n) and O(n log n) complexity in algorithms?',              expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'Write a SQL query to find all users who have not logged in for 30 days',                    expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'Refactor this JavaScript function to remove callback hell and use async/await',             expectedDomain: 'coding',   difficulty: 'easy' },
  { prompt: 'How do I declare a TypeScript interface with optional and readonly fields?',                 expectedDomain: 'coding',   difficulty: 'easy' },

  // ── Coding — hard (no keywords: crash, fault, subroutine, race condition, closure) ──
  { prompt: 'My application keeps crashing with a null pointer when processing user input',              expectedDomain: 'coding',   difficulty: 'hard' },
  { prompt: 'Why does my program behave differently in production compared to my local machine?',        expectedDomain: 'coding',   difficulty: 'hard' },
  { prompt: 'There is a fault in my subroutine that produces incorrect output on large inputs',          expectedDomain: 'coding',   difficulty: 'hard' },
  { prompt: 'Help me understand why closures capture the wrong variable value inside a loop',            expectedDomain: 'coding',   difficulty: 'hard' },
  { prompt: 'I am seeing a race condition when two users submit the same form simultaneously',           expectedDomain: 'coding',   difficulty: 'hard' },

  // ── Math — easy (keywords: solve, calculate, derivative, integral, probability, etc.) ──
  { prompt: 'Solve the equation 3x + 7 = 22 and show your working',                                     expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'Calculate the derivative of f(x) = x cubed plus 2x',                                      expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'Prove by induction that the sum of the first n integers equals n times n plus 1 over 2',   expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'Find the eigenvalues of the 2x2 matrix with rows 4 2 and 1 3',                             expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'What is the probability of drawing two red cards in a row from a shuffled 52-card deck?',  expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'Compute the definite integral of x squared from 0 to 3',                                   expectedDomain: 'math',     difficulty: 'easy' },
  { prompt: 'What is the standard deviation of the dataset 2 4 4 4 5 5 7 9?',                          expectedDomain: 'math',     difficulty: 'easy' },

  // ── Math — hard (no keywords: harmonic series, compound interest, arrangements, irrational) ──
  { prompt: 'Verify that the harmonic series diverges to infinity',                                      expectedDomain: 'math',     difficulty: 'hard' },
  { prompt: 'If I invest $1000 at 5 percent annual compound growth for 10 years what will I end up with?', expectedDomain: 'math',  difficulty: 'hard' },
  { prompt: 'How many different ways can 6 people be seated around a circular table?',                   expectedDomain: 'math',     difficulty: 'hard' },
  { prompt: 'Is the product of two irrational numbers always irrational?',                               expectedDomain: 'math',     difficulty: 'hard' },
  { prompt: 'What is the steepest descent direction for the function f of x y equals x squared plus y squared?', expectedDomain: 'math', difficulty: 'hard' },

  // ── Creative — easy (keywords: write+story, haiku, poem, dialogue, essay, screenplay, etc.) ──
  { prompt: 'Write a short story about a lighthouse keeper who discovers a message in a bottle',         expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Compose a haiku about the transition from winter to spring',                                expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Write a poem about the feeling of standing at the edge of the ocean at night',              expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Create a dialogue between two characters arguing about whether to leave their hometown',    expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Write a persuasive essay arguing that public libraries are essential to society',           expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Draft a short screenplay scene where two strangers meet during a city-wide blackout',       expectedDomain: 'creative', difficulty: 'easy' },
  { prompt: 'Describe the character arc of someone who spent 30 years as a lighthouse keeper',          expectedDomain: 'creative', difficulty: 'easy' },

  // ── Creative — hard (no keywords: tale, narrate, capture, touching, something about) ──
  { prompt: 'Tell me a tale about a lone astronaut who discovers a faint signal from deep space',        expectedDomain: 'creative', difficulty: 'hard' },
  { prompt: 'I want to capture the bittersweet feeling of leaving home for the first time in words',    expectedDomain: 'creative', difficulty: 'hard' },
  { prompt: 'Narrate the life of an old lighthouse through the eyes of its light',                       expectedDomain: 'creative', difficulty: 'hard' },
  { prompt: 'Give me something that feels both hopeful and melancholic about the passage of time',      expectedDomain: 'creative', difficulty: 'hard' },
  { prompt: 'Craft something touching about a grandfather passing down his pocket watch to his grandson', expectedDomain: 'creative', difficulty: 'hard' },

  // ── General — easy (clearly factual, no domain signals) ──
  { prompt: 'What is the capital of New Zealand?',                                                       expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'Who was Marie Curie and what did she discover?',                                            expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'What are the main symptoms of influenza?',                                                  expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'What time zone is Tokyo in relative to UTC?',                                               expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'When did the Second World War officially end?',                                             expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'What is the difference between a virus and a bacterium?',                                   expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'Why do leaves change color in autumn?',                                                     expectedDomain: 'general',  difficulty: 'easy' },
  { prompt: 'What causes earthquakes and where do they most commonly occur?',                            expectedDomain: 'general',  difficulty: 'easy' },

  // ── General — hard (easily confused with other domains) ──
  { prompt: 'Explain how neural networks learn to recognize patterns in data',                           expectedDomain: 'general',  difficulty: 'hard' },
  { prompt: 'What is the best sustainable approach to losing weight?',                                   expectedDomain: 'general',  difficulty: 'hard' },
  { prompt: 'How does the human brain form and store long-term memories?',                               expectedDomain: 'general',  difficulty: 'hard' },
  { prompt: 'What makes a good leader during a crisis?',                                                 expectedDomain: 'general',  difficulty: 'hard' },
  { prompt: 'How do vaccines train the immune system to fight future infections?',                       expectedDomain: 'general',  difficulty: 'hard' },
  { prompt: 'What events during the French Revolution changed the course of European history?',          expectedDomain: 'general',  difficulty: 'hard' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  testCase:       TestCase;
  actualDomain:   Domain;
  confidence:     number;
  model:          string;
  tier:           string;
  escalated:      boolean;
  latencyMs:      number;
  actualCostUsd:  number;
  gpt4oCostUsd:   number;
  strategyMode:   string;
  correct:        boolean;
  error?:         string;
}

// Minimal shape we read from the route response
interface RouteResponse {
  classification: { domain: string; confidence: number; estimatedTokens: number };
  finalModel:     { model: string; tier: string };
  escalated:      boolean;
  response:       string;
  latencyMs:      number;
  totalCostUsd:   number;
  strategyMode:   string;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function routePrompt(prompt: string): Promise<RouteResponse> {
  const res = await fetch(`${BASE_URL}/route`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ prompt, maxTokens: MAX_TOKENS }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
  }

  return res.json() as Promise<RouteResponse>;
}

// ---------------------------------------------------------------------------
// Cost helpers
// ---------------------------------------------------------------------------

/** Estimate what this call would have cost on GPT-4o. */
function estimateGpt4oCost(estimatedInputTokens: number, responseText: string): number {
  const outputTokens = Math.ceil(responseText.length / 4);
  return (estimatedInputTokens * GPT4O_INPUT_PER_1M + outputTokens * GPT4O_OUTPUT_PER_1M) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(n: number, d: number): string {
  if (d === 0) return '  —  ';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function usd(n: number): string {
  if (n < 0.0001) return `$${(n * 1000).toFixed(4)}m`; // show in milli-cents
  return `$${n.toFixed(4)}`;
}

function pad(s: string | number, width: number, right = false): string {
  const str = String(s);
  return right ? str.padStart(width) : str.padEnd(width);
}

function hr(char = '─', width = 78): string { return char.repeat(width); }

function row(...cols: Array<{ text: string | number; width: number; right?: boolean }>): string {
  return '│ ' + cols.map(c => pad(c.text, c.width, c.right)).join(' │ ') + ' │';
}

function headerRow(...cols: Array<{ text: string; width: number }>): string {
  return '│ ' + cols.map(c => pad(c.text, c.width)).join(' │ ') + ' │';
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runBenchmark(): Promise<void> {
  console.log('\n' + hr('═'));
  console.log('  ModelRouter Benchmark — 50 prompts');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Max tokens per request: ${MAX_TOKENS}`);
  console.log(`  Estimated cost: ~$0.01–0.05  |  Estimated time: 3–6 min`);
  console.log(hr('═'));
  console.log();

  const results: BenchmarkResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const idx = String(i + 1).padStart(2, '0');
    const tag = `[${idx}/${TEST_CASES.length}]`;

    process.stdout.write(`${tag} ${tc.difficulty.toUpperCase()} ${tc.expectedDomain.padEnd(8)} › ${tc.prompt.slice(0, 55).padEnd(55)} `);

    try {
      const rr = await routePrompt(tc.prompt);

      const actualDomain = rr.classification.domain as Domain;
      const correct      = actualDomain === tc.expectedDomain;
      const gpt4oCost    = estimateGpt4oCost(rr.classification.estimatedTokens, rr.response);

      results.push({
        testCase:      tc,
        actualDomain,
        confidence:    rr.classification.confidence,
        model:         rr.finalModel.model,
        tier:          rr.finalModel.tier,
        escalated:     rr.escalated,
        latencyMs:     rr.latencyMs,
        actualCostUsd: rr.totalCostUsd,
        gpt4oCostUsd:  gpt4oCost,
        strategyMode:  rr.strategyMode,
        correct,
      });

      const mark = correct ? '✓' : `✗ (got ${actualDomain})`;
      process.stdout.write(`${mark}  ${rr.latencyMs}ms  ${usd(rr.totalCostUsd)}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        testCase: tc, actualDomain: 'general' as Domain, confidence: 0,
        model: '', tier: '', escalated: false, latencyMs: 0,
        actualCostUsd: 0, gpt4oCostUsd: 0, strategyMode: 'error',
        correct: false, error: msg,
      });
      process.stdout.write(`ERROR: ${msg.slice(0, 40)}\n`);
    }

    if (i < TEST_CASES.length - 1) await sleep(REQUEST_DELAY);
  }

  const wallMs = Date.now() - startTime;
  printSummary(results, wallMs);
}

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------

function printSummary(results: BenchmarkResult[], wallMs: number): void {
  const W = 78;
  const domains:     Domain[]     = ['coding', 'math', 'creative', 'general'];
  const difficulties: Difficulty[] = ['easy', 'hard'];

  // ── Derived sets ──────────────────────────────────────────────────────────
  const valid     = results.filter(r => !r.error);
  const errored   = results.filter(r =>  r.error);
  const correct   = valid.filter(r => r.correct);
  const escalated = valid.filter(r => r.escalated);

  const totalActual = valid.reduce((s, r) => s + r.actualCostUsd, 0);
  const totalGpt4o  = valid.reduce((s, r) => s + r.gpt4oCostUsd,  0);
  const savingsPct  = totalGpt4o > 0 ? ((totalGpt4o - totalActual) / totalGpt4o) * 100 : 0;

  const avgLatency  = valid.length > 0
    ? valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length
    : 0;

  // Mode counts
  const modeCounts: Record<string, number> = {};
  for (const r of valid) modeCounts[r.strategyMode] = (modeCounts[r.strategyMode] ?? 0) + 1;

  // Tier counts
  const tierCounts: Record<string, number> = {};
  for (const r of valid) tierCounts[r.tier] = (tierCounts[r.tier] ?? 0) + 1;

  console.log('\n\n' + hr('═', W));
  console.log('  BENCHMARK SUMMARY');
  console.log(hr('═', W));

  // ── 1. Classification accuracy ───────────────────────────────────────────
  console.log('\n  ① Classification Accuracy\n');
  console.log('  ┌──────────────┬────────┬────────────┬────────────┬────────────┐');
  console.log('  │ Domain       │  Total │  Correct   │  Accuracy  │ Easy / Hard│');
  console.log('  ├──────────────┼────────┼────────────┼────────────┼────────────┤');

  for (const domain of domains) {
    const domainResults = valid.filter(r => r.testCase.expectedDomain === domain);
    const domCorrect    = domainResults.filter(r => r.correct);

    const easyTotal   = domainResults.filter(r => r.testCase.difficulty === 'easy').length;
    const easyCorrect = domainResults.filter(r => r.testCase.difficulty === 'easy' && r.correct).length;
    const hardTotal   = domainResults.filter(r => r.testCase.difficulty === 'hard').length;
    const hardCorrect = domainResults.filter(r => r.testCase.difficulty === 'hard' && r.correct).length;

    const easyHardStr = `${pct(easyCorrect, easyTotal)} / ${pct(hardCorrect, hardTotal)}`;

    console.log(
      `  │ ${pad(domain, 12)} │ ${pad(domainResults.length, 6, true)} │ ` +
      `${pad(domCorrect.length, 10, true)} │ ` +
      `${pad(pct(domCorrect.length, domainResults.length), 10, true)} │ ` +
      `${pad(easyHardStr, 10, true)} │`
    );
  }

  console.log('  ├──────────────┼────────┼────────────┼────────────┼────────────┤');
  console.log(
    `  │ ${'TOTAL'.padEnd(12)} │ ${pad(valid.length, 6, true)} │ ` +
    `${pad(correct.length, 10, true)} │ ` +
    `${pad(pct(correct.length, valid.length), 10, true)} │ ` +
    `${pad('', 10)} │`
  );
  console.log('  └──────────────┴────────┴────────────┴────────────┴────────────┘');

  // ── 2. Misclassifications ────────────────────────────────────────────────
  const wrong = valid.filter(r => !r.correct);
  if (wrong.length > 0) {
    console.log('\n  ② Misclassified Prompts\n');
    for (const r of wrong) {
      const diff = r.testCase.difficulty.toUpperCase();
      console.log(`  [${diff}] Expected ${r.testCase.expectedDomain.padEnd(8)} → got ${r.actualDomain.padEnd(8)} (conf: ${r.confidence.toFixed(2)})`);
      console.log(`        "${r.testCase.prompt.slice(0, 70)}"`);
    }
  } else {
    console.log('\n  ② Misclassified Prompts\n');
    console.log('  None — 100% accuracy');
  }

  // ── 3. Cost ──────────────────────────────────────────────────────────────
  console.log('\n  ③ Cost vs GPT-4o Baseline\n');
  console.log('  ┌──────────────────────────────────┬───────────────┐');
  console.log('  │ Metric                           │         Value │');
  console.log('  ├──────────────────────────────────┼───────────────┤');
  console.log(`  │ ${'Total actual cost'.padEnd(32)} │ ${usd(totalActual).padStart(13)} │`);
  console.log(`  │ ${'Hypothetical GPT-4o cost'.padEnd(32)} │ ${usd(totalGpt4o).padStart(13)} │`);
  console.log(`  │ ${'Savings vs GPT-4o'.padEnd(32)} │ ${`${savingsPct.toFixed(1)}%`.padStart(13)} │`);
  console.log(`  │ ${'Cost per request (avg)'.padEnd(32)} │ ${usd(totalActual / Math.max(valid.length, 1)).padStart(13)} │`);
  console.log('  └──────────────────────────────────┴───────────────┘');

  // ── 4. Latency ───────────────────────────────────────────────────────────
  const latencies   = valid.map(r => r.latencyMs).sort((a, b) => a - b);
  const p50         = latencies[Math.floor(latencies.length * 0.50)] ?? 0;
  const p95         = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const maxLatency  = latencies[latencies.length - 1] ?? 0;

  console.log('\n  ④ Latency\n');
  console.log('  ┌──────────────────────────────────┬───────────────┐');
  console.log('  │ Metric                           │         Value │');
  console.log('  ├──────────────────────────────────┼───────────────┤');
  console.log(`  │ ${'Average'.padEnd(32)} │ ${`${avgLatency.toFixed(0)} ms`.padStart(13)} │`);
  console.log(`  │ ${'p50'.padEnd(32)} │ ${`${p50} ms`.padStart(13)} │`);
  console.log(`  │ ${'p95'.padEnd(32)} │ ${`${p95} ms`.padStart(13)} │`);
  console.log(`  │ ${'Max'.padEnd(32)} │ ${`${maxLatency} ms`.padStart(13)} │`);
  console.log(`  │ ${'Total wall time'.padEnd(32)} │ ${`${(wallMs / 1000).toFixed(1)} s`.padStart(13)} │`);
  console.log('  └──────────────────────────────────┴───────────────┘');

  // ── 5. Escalation + strategy ─────────────────────────────────────────────
  console.log('\n  ⑤ Routing Behaviour\n');
  console.log('  ┌──────────────────────────────────┬───────────────┐');
  console.log('  │ Metric                           │         Value │');
  console.log('  ├──────────────────────────────────┼───────────────┤');
  console.log(`  │ ${'Escalation rate'.padEnd(32)} │ ${pct(escalated.length, valid.length).padStart(13)} │`);
  for (const mode of ['exploitation', 'exploration', 'fallback']) {
    const count = modeCounts[mode] ?? 0;
    console.log(`  │ ${`Strategy: ${mode}`.padEnd(32)} │ ${`${count} (${pct(count, valid.length)})`.padStart(13)} │`);
  }
  console.log('  ├──────────────────────────────────┼───────────────┤');
  for (const tier of ['cheap', 'balanced', 'premium']) {
    const count = tierCounts[tier] ?? 0;
    console.log(`  │ ${`Tier: ${tier}`.padEnd(32)} │ ${`${count} (${pct(count, valid.length)})`.padStart(13)} │`);
  }
  if (errored.length > 0) {
    console.log('  ├──────────────────────────────────┼───────────────┤');
    console.log(`  │ ${'Errored requests'.padEnd(32)} │ ${String(errored.length).padStart(13)} │`);
  }
  console.log('  └──────────────────────────────────┴───────────────┘');

  // ── Interpretation guide ─────────────────────────────────────────────────
  printInterpretation(correct.length, valid.length, savingsPct, escalated.length, valid.length);
}

// ---------------------------------------------------------------------------
// Interpretation guide
// ---------------------------------------------------------------------------

function printInterpretation(
  correctCount: number,
  totalCount:   number,
  savingsPct:   number,
  escalatedCount: number,
  validCount:   number,
): void {
  const accuracy    = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
  const escalPct    = validCount > 0 ? (escalatedCount / validCount) * 100 : 0;

  console.log('\n  ─────────────────────────────────────────────────────────────────────────');
  console.log('  HOW TO INTERPRET THESE RESULTS');
  console.log('  ─────────────────────────────────────────────────────────────────────────');

  // Accuracy
  const accStatus =
    accuracy >= 90 ? '✓ EXCELLENT' :
    accuracy >= 80 ? '~ GOOD' :
    accuracy >= 65 ? '△ FAIR — embedding anchors may need tuning' :
                     '✗ POOR — check OPENAI_API_KEY and anchor prompts';
  console.log(`\n  Accuracy ${accuracy.toFixed(1)}%  →  ${accStatus}`);
  console.log('    ≥ 90%  Hybrid classifier working as designed.');
  console.log('    80–90% Acceptable. Review misclassified "hard" prompts.');
  console.log('    65–80% Embedding path underperforming. Diversify anchor examples.');
  console.log('    < 65%  Likely no OPENAI_API_KEY — all calls fell back to rule-based.');

  // Cost
  const costStatus =
    savingsPct >= 60 ? '✓ EXCELLENT — router avoids GPT-4o for most prompts' :
    savingsPct >= 40 ? '~ GOOD' :
    savingsPct >= 20 ? '△ FAIR — more tasks hitting premium tier than expected' :
                       '△ LOW — check if provider map is routing all tasks to premium';
  console.log(`\n  Cost savings ${savingsPct.toFixed(1)}%  →  ${costStatus}`);
  console.log('    ≥ 60%  Router is directing easy tasks to cheap/balanced tiers.');
  console.log('    40–60% Mixed. Some complex tasks justifiably hitting premium.');
  console.log('    < 40%  Many requests hitting premium tier; review routing table.');

  // Escalation
  const escalStatus =
    escalPct <= 5  ? '△ LOW — classifier may be overconfident; lower CONFIDENCE_THRESHOLD' :
    escalPct <= 25 ? '✓ HEALTHY' :
    escalPct <= 40 ? '~ ELEVATED — many ambiguous prompts; consider tuning threshold' :
                     '✗ HIGH — CONFIDENCE_THRESHOLD may be set too low';
  console.log(`\n  Escalation ${escalPct.toFixed(1)}%  →  ${escalStatus}`);
  console.log('    5–25%  Healthy. Escalation fires when the classifier is genuinely uncertain.');
  console.log('    < 5%   Rarely fires. Check CONFIDENCE_THRESHOLD (default: 0.6).');
  console.log('    > 25%  Fires too often — raises cost and latency unnecessarily.');

  console.log('\n  ─────────────────────────────────────────────────────────────────────────\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runBenchmark().catch((err) => {
  console.error('\nFATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
