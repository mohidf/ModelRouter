// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RecordParams {
  initialModel:          string;
  finalModel:            string;
  escalated:             boolean;
  latencyMs:             number; // end-to-end request latency
  promptTokens:          number; // input tokens, shared by all model calls in this request
  initialResponseTokens: number; // output tokens from the initial model
  finalResponseTokens:   number; // output tokens from the final model (same if not escalated)
  initialModelLatencyMs: number; // provider-reported latency for the initial call
  finalModelLatencyMs:   number; // provider-reported latency for the final call
  initialCostUsd:        number; // pre-computed by the provider (owns its own pricing)
  finalCostUsd:          number; // 0 if not escalated
}

export interface ModelMetrics {
  calls:            number;
  averageLatencyMs: number;
  totalTokens:      number; // input + output for calls made by this model
  totalCostUsd:     number;
}

export interface MetricsSnapshot {
  totalRequests:         number;
  escalationCount:       number;
  escalationRatePercent: number; // 0–100, one decimal place
  totalTokens:           number; // across all model calls
  totalEstimatedCostUsd: number;
  averageLatencyMs:      number; // end-to-end request average
  perModel:              Record<string, ModelMetrics>;
}

// ---------------------------------------------------------------------------
// Internal per-model accumulator
// ---------------------------------------------------------------------------

interface ModelAccumulator {
  calls:          number;
  totalLatencyMs: number;
  totalTokens:    number;
  totalCostUsd:   number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class MetricsStore {
  private totalRequests    = 0;
  private escalationCount  = 0;
  private totalLatencyMs   = 0;
  private totalTokens      = 0;
  private totalCostUsd     = 0;
  private readonly perModel = new Map<string, ModelAccumulator>();

  record(p: RecordParams): void {
    this.totalRequests++;
    this.totalLatencyMs += p.latencyMs;

    // Initial model call
    const initialTotalTokens = p.promptTokens + p.initialResponseTokens;
    this.addToModel(p.initialModel, p.initialModelLatencyMs, initialTotalTokens, p.initialCostUsd);
    this.totalTokens  += initialTotalTokens;
    this.totalCostUsd += p.initialCostUsd;

    // Final model call (only if escalated — avoids double-counting the same call)
    if (p.escalated) {
      this.escalationCount++;

      const finalTotalTokens = p.promptTokens + p.finalResponseTokens;
      this.addToModel(p.finalModel, p.finalModelLatencyMs, finalTotalTokens, p.finalCostUsd);
      this.totalTokens  += finalTotalTokens;
      this.totalCostUsd += p.finalCostUsd;
    }
  }

  snapshot(): MetricsSnapshot {
    const perModel: Record<string, ModelMetrics> = {};
    for (const [model, acc] of this.perModel) {
      perModel[model] = {
        calls:            acc.calls,
        averageLatencyMs: acc.calls === 0 ? 0 : Math.round(acc.totalLatencyMs / acc.calls),
        totalTokens:      acc.totalTokens,
        totalCostUsd:     parseFloat(acc.totalCostUsd.toFixed(6)),
      };
    }

    const escalationRatePercent =
      this.totalRequests === 0
        ? 0
        : parseFloat(((this.escalationCount / this.totalRequests) * 100).toFixed(1));

    return {
      totalRequests:         this.totalRequests,
      escalationCount:       this.escalationCount,
      escalationRatePercent,
      totalTokens:           this.totalTokens,
      totalEstimatedCostUsd: parseFloat(this.totalCostUsd.toFixed(6)),
      averageLatencyMs:
        this.totalRequests === 0 ? 0 : Math.round(this.totalLatencyMs / this.totalRequests),
      perModel,
    };
  }

  private addToModel(
    model: string,
    latencyMs: number,
    tokens: number,
    costUsd: number,
  ): void {
    const acc = this.perModel.get(model) ?? { calls: 0, totalLatencyMs: 0, totalTokens: 0, totalCostUsd: 0 };
    acc.calls++;
    acc.totalLatencyMs += latencyMs;
    acc.totalTokens    += tokens;
    acc.totalCostUsd   += costUsd;
    this.perModel.set(model, acc);
  }
}

export const metrics = new MetricsStore();
