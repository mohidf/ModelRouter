import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { RouteResponse, TaskComplexity, TaskDomain, ModelTier, EvaluatedOption } from '../types';

interface Props {
  result: RouteResponse | null;
  error: string | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const DOMAIN_LABELS: Record<TaskDomain, string> = {
  coding: 'Coding', math: 'Math', creative: 'Creative', general: 'General',
};

const COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};

const TIER_LABELS: Record<ModelTier, string> = {
  cheap: 'Cheap', balanced: 'Balanced', premium: 'Premium',
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic',
};

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center bg-[#303030] text-[#b4b4b4] border border-[#3f3f3f] text-xs font-medium px-1.5 py-0.5 rounded">
      {PROVIDER_LABELS[provider] ?? provider}
    </span>
  );
}

function TierBadge({ tier }: { tier: ModelTier }) {
  return (
    <span className="inline-flex items-center bg-emerald-900/40 text-emerald-400 border border-emerald-800/60 text-xs font-medium px-1.5 py-0.5 rounded">
      {TIER_LABELS[tier]}
    </span>
  );
}

function EscalatedBadge() {
  return (
    <span className="inline-flex items-center bg-red-900/40 text-red-400 border border-red-800/60 text-xs font-medium px-1.5 py-0.5 rounded">
      escalated
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pipeline building blocks
// ---------------------------------------------------------------------------

function PipelineStage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-[#303030] border border-[#3f3f3f] rounded-xl px-4 py-3">
      <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-3 bg-[#3f3f3f]" />
        <svg className="w-3 h-3 text-[#3f3f3f]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

function StrategyModeBadge({ mode }: { mode: 'fallback' | 'exploration' | 'exploitation' }) {
  const styles: Record<string, string> = {
    exploitation: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/60',
    exploration:  'bg-amber-900/40 text-amber-400 border-amber-800/60',
    fallback:     'bg-[#303030] text-[#8e8e8e] border-[#3f3f3f]',
  };
  const labels: Record<string, string> = {
    exploitation: 'Exploitation — highest scored option',
    exploration:  'Exploration (ε) — random selection',
    fallback:     'Fallback — no historical data',
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded border ${styles[mode]}`}>
      {labels[mode]}
    </span>
  );
}

function OptionRow({ option, isChosen }: { option: EvaluatedOption; isChosen: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
      isChosen ? 'bg-emerald-900/20 border border-emerald-800/60' : 'hover:bg-[#2f2f2f]'
    }`}>
      {/* Star */}
      <span className={`text-sm w-4 text-center shrink-0 select-none ${isChosen ? 'text-emerald-400' : 'text-transparent'}`}>
        ⭐
      </span>

      <ProviderBadge provider={option.provider} />
      <TierBadge tier={option.tier} />

      {/* Metrics */}
      <span className="flex-1 flex items-center gap-2 text-xs text-[#8e8e8e] tabular-nums flex-wrap">
        <span title="Avg confidence">{(option.averageConfidence * 100).toFixed(0)}% conf</span>
        <span className="text-[#3f3f3f]">·</span>
        <span title="Avg latency">{Math.round(option.averageLatencyMs)} ms</span>
        <span className="text-[#3f3f3f]">·</span>
        <span className="font-mono" title="Avg cost per call">${option.averageCostUsd.toFixed(6)}</span>
        <span className="text-[#3f3f3f]">·</span>
        <span title="Escalation rate">{(option.escalationRate * 100).toFixed(0)}% esc</span>
      </span>

      {/* Score */}
      <span className={`text-xs font-mono font-semibold shrink-0 ${isChosen ? 'text-emerald-400' : 'text-[#8e8e8e]'}`}>
        {option.score.toFixed(3)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ResponsePanel({ result, error, loading }: Props) {
  const [showDecision, setShowDecision] = useState(false);

  if (loading) {
    return (
      <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl p-10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-[#3f3f3f] border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-xs text-[#8e8e8e]">Routing your prompt...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl px-6 py-5">
        <p className="text-sm text-red-400 font-medium">Request failed</p>
        <p className="text-xs text-[#8e8e8e] mt-1">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const { classification, initialModel, finalModel, escalated, strategyMode, evaluatedOptions } = result;
  const chosenKey = `${initialModel.provider}:${initialModel.tier}`;

  return (
    <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl overflow-hidden">
      {/* Response — rendered as Markdown */}
      <div className="px-6 pt-6 pb-5">
        <div className="prose prose-invert prose-chat max-w-none text-[15px] leading-[1.75]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {result.response}
          </ReactMarkdown>
        </div>
      </div>

      {/* Metadata row */}
      <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-t border-[#3f3f3f]">
        <span className="text-xs bg-[#303030] text-[#b4b4b4] border border-[#3f3f3f] px-1.5 py-0.5 rounded">
          {DOMAIN_LABELS[classification.domain]}
        </span>
        <TierBadge tier={finalModel.tier} />
        <span className="text-[#3f3f3f] text-xs select-none">·</span>
        <span className="font-mono text-xs text-[#8e8e8e]">{finalModel.model}</span>
        <span className="text-[#3f3f3f] text-xs select-none">·</span>
        <span className="text-xs text-[#8e8e8e] tabular-nums">{result.latencyMs} ms</span>
        <span className="text-[#3f3f3f] text-xs select-none">·</span>
        <span className="font-mono text-xs text-[#8e8e8e]">${result.totalCostUsd.toFixed(6)}</span>
        {escalated && (
          <>
            <span className="text-[#3f3f3f] text-xs select-none">·</span>
            <EscalatedBadge />
          </>
        )}
      </div>

      {/* Routing Decision — collapsible pipeline visualization */}
      <div className="border-t border-[#3f3f3f]">
        <button
          type="button"
          onClick={() => setShowDecision((v) => !v)}
          className="w-full flex items-center gap-2 px-6 py-2.5 text-xs text-[#8e8e8e] hover:text-[#b4b4b4] hover:bg-[#303030] transition-colors text-left"
        >
          <svg
            className={`w-3 h-3 transition-transform shrink-0 ${showDecision ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Routing Decision
        </button>

        {showDecision && (
          <div className="px-6 pb-6 pt-5 border-t border-[#3f3f3f] flex flex-col">

            {/* Stage 1: Classifier */}
            <PipelineStage label="Classifier">
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-medium text-[#ececec]">{DOMAIN_LABELS[classification.domain]}</span>
                <span className="text-[#3f3f3f]">·</span>
                <span className="text-[#b4b4b4]">{COMPLEXITY_LABELS[classification.complexity]} complexity</span>
                <span className="text-[#3f3f3f]">·</span>
                <span className="text-[#b4b4b4]">{Math.round(classification.confidence * 100)}% confidence</span>
                <span className="text-[#3f3f3f]">·</span>
                <span className="text-[#8e8e8e]">~{classification.estimatedTokens.toLocaleString()} tokens</span>
              </div>
            </PipelineStage>

            <Arrow />

            {/* Stage 2: Strategy Engine */}
            <PipelineStage label="Strategy Engine">
              <StrategyModeBadge mode={strategyMode} />
            </PipelineStage>

            <Arrow />

            {/* Stage 3: Evaluated options or fallback note */}
            {evaluatedOptions.length > 0 ? (
              <div className="bg-[#303030] border border-[#3f3f3f] rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#3f3f3f] flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium">
                    Evaluated Options
                  </p>
                  {strategyMode === 'exploration' && (
                    <span className="text-[11px] text-amber-400">
                      — ε exploration bypassed scoring
                    </span>
                  )}
                </div>
                <div className="px-2 py-2 flex flex-col gap-0.5">
                  {evaluatedOptions.map((opt) => (
                    <OptionRow
                      key={`${opt.provider}:${opt.tier}`}
                      option={opt}
                      isChosen={strategyMode === 'exploitation' && `${opt.provider}:${opt.tier}` === chosenKey}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <PipelineStage label="Default Routing">
                <p className="text-xs text-[#8e8e8e]">
                  No historical data — using built-in routing table.
                </p>
              </PipelineStage>
            )}

            <Arrow />

            {/* Stage 4: Selected model */}
            <PipelineStage label={escalated ? 'Escalated Model' : 'Selected Model'}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ProviderBadge provider={finalModel.provider} />
                <TierBadge tier={finalModel.tier} />
                <span className="font-mono text-xs text-[#b4b4b4]">{finalModel.model}</span>
                {escalated && <EscalatedBadge />}
              </div>
              <p className="text-[11px] text-[#8e8e8e] mt-1.5 leading-snug">{finalModel.reason}</p>
            </PipelineStage>

          </div>
        )}
      </div>
    </div>
  );
}
