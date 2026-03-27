import type {
  ModelSelection,
  RouteResponse,
  TaskComplexity,
  TaskDomain,
  ClassificationResult,
  EvaluatedOption,
} from '../providers/types';
import type { ResolvedModel }          from '../providers/providerManager';
import type { GenerateResult, CostEstimate } from '../providers/baseProvider';
import type { WeightOverrideConfig, OptimizationMode, TaskWeights } from './strategyEngine';
import { providerManager }             from '../providers';
import { hybridClassifier as classifier } from './hybridClassifier';
import { metrics }                     from './metrics';
import { performanceStore }            from './performanceStore';
import { strategyEngine }              from './strategyEngine';
import { logRequest }                  from './requestLog';
import { logger }                      from '../utils/logger';
import { config }                      from '../config';

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function downgradedComplexity(complexity: TaskComplexity): TaskComplexity {
  if (complexity === 'high')   return 'medium';
  if (complexity === 'medium') return 'low';
  return 'low';
}

const ZERO_COST: CostEstimate = {
  inputCostUsd: 0, outputCostUsd: 0, tierMultiplier: 1, totalCostUsd: 0,
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface EscalationInput {
  initial:       ResolvedModel;
  initialResult: GenerateResult;
  initialCost:   CostEstimate;
  domain:        TaskDomain;
  confidence:    number;
  prompt:        string;
  maxTokens:     number;
  userApiKeys:   Record<string, string>;
}

interface EscalationOutcome {
  final:       ResolvedModel;
  finalResult: GenerateResult;
  finalCost:   CostEstimate;
  didEscalate: boolean;
}

interface MetricsInput {
  initialModel:   ModelSelection;
  initialResult:  GenerateResult;
  initialCost:    CostEstimate;
  finalModel:     ModelSelection;
  finalResult:    GenerateResult;
  finalCost:      CostEstimate;
  classification: ClassificationResult;
  didEscalate:    boolean;
  latencyMs:      number;
}

// ---------------------------------------------------------------------------
// RoutingEngine
// ---------------------------------------------------------------------------

const VALID_MODES = new Set<string>(['cost', 'quality', 'balanced']);

/**
 * Parse and sanitize caller-supplied custom weights.
 * Accepts only finite, non-negative numbers in [0, 100].
 * Values outside that range are silently discarded so the domain
 * defaults remain in effect — a bad weight never reaches the scorer.
 */
function parseCustomWeights(raw: Record<string, unknown>): Partial<TaskWeights> {
  const result: Partial<TaskWeights> = {};
  const keys: (keyof TaskWeights)[] = [
    'confidenceWeight', 'costWeight', 'latencyWeight', 'escalationWeight',
  ];
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === 'number' && isFinite(val) && val >= 0 && val <= 100) {
      result[key] = val;
    }
  }
  return result;
}

export class RoutingEngine {
  async route(raw: {
    prompt:            string;
    maxTokens?:        unknown;
    preferCost?:       unknown;
    optimizationMode?: unknown;
    customWeights?:    unknown;
    userApiKeys?:      Record<string, string>;
  }): Promise<RouteResponse> {
    const start       = Date.now();
    const prompt      = (raw.prompt as string).trim();
    const maxTokens   = typeof raw.maxTokens  === 'number'  ? raw.maxTokens  : config.defaultMaxTokens;
    const preferCost  = typeof raw.preferCost === 'boolean' ? raw.preferCost : false;
    const userApiKeys = raw.userApiKeys ?? {};

    // Build per-request weight override config
    const overrideConfig: WeightOverrideConfig = {};
    if (typeof raw.optimizationMode === 'string' && VALID_MODES.has(raw.optimizationMode)) {
      overrideConfig.optimizationMode = raw.optimizationMode as OptimizationMode;
    }
    if (raw.customWeights && typeof raw.customWeights === 'object') {
      const parsed = parseCustomWeights(raw.customWeights as Record<string, unknown>);
      if (Object.keys(parsed).length > 0) overrideConfig.customWeights = parsed;
    }

    // 1. Classify + ask StrategyEngine for recommended provider + tier
    const classification = await classifier.classify(prompt);
    const { domain, complexity, confidence } = classification;
    const effectiveComplexity = preferCost ? downgradedComplexity(complexity) : complexity;
    const decision = await strategyEngine.choose(domain, effectiveComplexity, overrideConfig);
    const initial  = decision.resolved;

    // 2. Execute initial request
    const { result: initialResult, cost: initialCost } = await providerManager.dispatch(
      initial,
      prompt,
      { maxTokens, userApiKeys },
    );

    // 3. Escalate if needed — records both attempts in PerformanceStore
    const { final, finalResult, finalCost, didEscalate } = await this.escalateIfNeeded({
      initial, initialResult, initialCost, domain, confidence, prompt, maxTokens, userApiKeys,
    });

    // 4. Update metrics
    const latencyMs    = Date.now() - start;
    const totalCostUsd = initialCost.totalCostUsd + finalCost.totalCostUsd;
    const initialModel = this.toModelSelection(initial, initialResult);
    const finalModel   = this.toModelSelection(final, finalResult);

    this.recordMetrics({
      initialModel, initialResult, initialCost,
      finalModel,   finalResult,   finalCost,
      classification, didEscalate, latencyMs,
    });

    // Fire-and-forget: persist the completed routing decision
    logRequest({
      prompt,
      modelId:    finalModel.model,
      provider:   finalModel.provider,
      tier:       finalModel.tier,
      taskType:   domain,
      latencyMs,
      confidence: finalResult.modelConfidence,
      costUsd:    totalCostUsd,
      escalated:  didEscalate,
    }).catch(err => logger.error('Request log write failed', { err: String(err) }));

    logger.debug('Route resolved', {
      domain,
      complexity,
      confidence,
      strategyFallback: decision.usedFallback,
      strategyExplored: decision.explored,
      strategyScore:    decision.score,
      initialModel:     initialModel.model,
      initialTier:      initialModel.tier,
      finalModel:       finalModel.model,
      finalTier:        finalModel.tier,
      escalated:        didEscalate,
      totalCostUsd,
      latencyMs,
    });

    const strategyMode = decision.usedFallback ? 'fallback'
                       : decision.explored     ? 'exploration'
                       : 'exploitation';

    const evaluatedOptions: EvaluatedOption[] = decision.rankedOptions.map(s => ({
      modelId:           s.modelId,
      provider:          s.provider,
      tier:              s.tier,
      score:             s.score,
      averageConfidence: s.averageConfidence,
      averageLatencyMs:  s.averageLatencyMs,
      averageCostUsd:    s.averageCostUsd,
      escalationRate:    s.escalationRate,
      totalRequests:     s.totalRequests,
    }));

    return {
      classification,
      initialModel,
      finalModel,
      escalated:    didEscalate,
      response:     finalResult.text,
      latencyMs,
      totalCostUsd,
      strategyMode,
      evaluatedOptions,
    };
  }

  // ── Phase 3: escalation + PerformanceStore recording ─────────────────────

  /**
   * Attempts escalation when classifier confidence falls below threshold.
   *
   * Records PerformanceStore entries for every completed call:
   *   - No escalation:   1 entry  (initial, escalated: false)
   *   - Escalation:      2 entries (initial escalated: true, final escalated: false)
   *
   * Returns the final resolved model, result, cost, and escalation flag.
   */
  private async escalateIfNeeded(p: EscalationInput): Promise<EscalationOutcome> {
    if (p.confidence < config.confidenceThreshold) {
      const target = providerManager.escalate(p.initial, p.domain);

      if (target !== null) {
        const final = {
          ...target,
          reason: `Escalated (confidence ${p.confidence} < ${config.confidenceThreshold}): ${target.reason}`,
        };
        const { result: finalResult, cost: finalCost } = await providerManager.dispatch(
          final,
          p.prompt,
          { maxTokens: p.maxTokens, userApiKeys: p.userApiKeys },
        );

        // Record both attempts
        this.recordPerf(p.initial, p.initialResult, p.initialCost, p.domain, true);
        this.recordPerf(final,     finalResult,      finalCost,      p.domain, false);

        return { final, finalResult, finalCost, didEscalate: true };
      }
    }

    // No escalation — record single initial attempt
    this.recordPerf(p.initial, p.initialResult, p.initialCost, p.domain, false);
    return { final: p.initial, finalResult: p.initialResult, finalCost: ZERO_COST, didEscalate: false };
  }

  // ── Phase 4: aggregate metrics ────────────────────────────────────────────

  private recordMetrics(p: MetricsInput): void {
    metrics.record({
      initialModel:          p.initialModel.model,
      finalModel:            p.finalModel.model,
      escalated:             p.didEscalate,
      latencyMs:             p.latencyMs,
      promptTokens:          p.classification.estimatedTokens,
      initialResponseTokens: p.initialResult.outputTokens,
      finalResponseTokens:   p.finalResult.outputTokens,
      initialModelLatencyMs: p.initialResult.latencyMs,
      finalModelLatencyMs:   p.finalResult.latencyMs,
      initialCostUsd:        p.initialCost.totalCostUsd,
      finalCostUsd:          p.finalCost.totalCostUsd,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private toModelSelection(resolved: ResolvedModel, result: GenerateResult): ModelSelection {
    return {
      provider:        resolved.provider.name,
      model:           resolved.model,
      tier:            resolved.tier,
      reason:          resolved.reason,
      modelConfidence: result.modelConfidence,
    };
  }

  private recordPerf(
    resolved:  ResolvedModel,
    result:    GenerateResult,
    cost:      CostEstimate,
    domain:    TaskDomain,
    escalated: boolean,
  ): void {
    performanceStore.recordResult({
      modelId:    resolved.model,
      provider:   resolved.provider.name,
      tier:       resolved.tier,
      taskType:   domain,
      latencyMs:  result.latencyMs,
      confidence: result.modelConfidence,
      escalated,
      costUsd:    cost.totalCostUsd,
    }).catch(err => logger.error('PerformanceStore write failed', { err: String(err) }));
  }
}

export const routingEngine = new RoutingEngine();
