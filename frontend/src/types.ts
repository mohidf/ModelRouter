export type TaskDomain =
  | 'coding'
  | 'math'
  | 'creative'
  | 'general'
  | 'research'
  | 'summarization'
  | 'vision'
  | 'coding_debug'
  | 'general_chat'
  | 'multilingual'
  | 'math_reasoning';

export const ALL_DOMAINS: readonly TaskDomain[] = [
  'coding', 'math', 'creative', 'general',
  'research', 'summarization', 'vision',
  'coding_debug', 'general_chat', 'multilingual', 'math_reasoning',
];
export type TaskComplexity = 'low' | 'medium' | 'high';
export type ModelTier = 'cheap' | 'balanced' | 'premium';
export type OptimizationMode = 'cost' | 'quality' | 'balanced';

export interface ClassificationResult {
  domain: TaskDomain;
  complexity: TaskComplexity;
  confidence: number;
  estimatedTokens: number;
}

export interface ModelSelection {
  provider: string;
  model: string;
  tier: ModelTier;
  reason: string;
  modelConfidence: number;
}

export interface EvaluatedOption {
  modelId:           string;
  provider:          string;
  tier:              ModelTier;
  score:             number;
  averageConfidence: number;
  averageLatencyMs:  number;
  averageCostUsd:    number;
  escalationRate:    number;
  totalRequests:     number;
}

export interface RouteResponse {
  classification: ClassificationResult;
  initialModel: ModelSelection;
  finalModel: ModelSelection;
  escalated: boolean;
  response: string;
  latencyMs: number;
  totalCostUsd: number;
  strategyMode: 'fallback' | 'exploration' | 'exploitation';
  evaluatedOptions: EvaluatedOption[];
  freeTier?: boolean;
}

export interface ModelMetrics {
  calls: number;
  averageLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface MetricsSnapshot {
  totalRequests: number;
  escalationCount: number;
  escalationRatePercent: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  averageLatencyMs: number;
  perModel: Record<string, ModelMetrics>;
}

export interface HistoryEntry {
  id: string;
  prompt: string;
  result: RouteResponse;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Optimization Insights  (mirrors backend PerformanceStats + InsightsResponse)
// ---------------------------------------------------------------------------

export interface PerformanceStats {
  modelId:           string;
  provider:          string;
  tier:              ModelTier;
  taskType:          TaskDomain;
  totalRequests:     number;
  averageLatencyMs:  number;
  averageConfidence: number;
  escalationRate:    number;
  averageCostUsd:    number;
}

export interface ScoredStats extends PerformanceStats {
  score: number;
}

export interface TaskInsight {
  best:      ScoredStats | null;
  bestScore: number | null;
  all:       ScoredStats[];
}

export interface InsightsResponse {
  epsilon:    number;
  byTaskType: Record<TaskDomain, TaskInsight>;
}
