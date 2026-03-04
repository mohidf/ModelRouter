import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { HistoryEntry, TaskComplexity, TaskDomain, ModelSelection, ModelTier } from '../types';

interface Props {
  history: HistoryEntry[];
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModelDetail({ model }: { model: ModelSelection }) {
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5">
        <ProviderBadge provider={model.provider} />
        <TierBadge tier={model.tier} />
      </span>
      <span className="font-mono text-[11px] bg-[#303030] text-[#8e8e8e] border border-[#3f3f3f] px-1.5 py-0.5 rounded">
        {model.model}
      </span>
      <span className="text-[11px] text-[#8e8e8e]">{Math.round(model.modelConfidence * 100)}% conf.</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function HistoryPanel({ history }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (history.length === 0) return null;

  function toggle(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[#8e8e8e] uppercase tracking-wide">Recent</span>
        <span className="text-xs text-[#8e8e8e]">{history.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {history.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const { result } = entry;

          return (
            <div key={entry.id} className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl overflow-hidden">
              {/* Collapsed row */}
              <button
                onClick={() => toggle(entry.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-[#303030] transition-colors"
              >
                {/* Prompt preview */}
                <span className="flex-1 text-xs text-[#b4b4b4] truncate min-w-0">{entry.prompt}</span>

                {/* Meta */}
                <span className="flex items-center gap-2 shrink-0">
                  {result.escalated && (
                    <span className="text-xs text-red-400 font-medium">↑ escalated</span>
                  )}
                  <ProviderBadge provider={result.finalModel.provider} />
                  <TierBadge tier={result.finalModel.tier} />
                  <span className="text-xs text-[#8e8e8e] tabular-nums">{result.latencyMs} ms</span>
                  <span className="text-[#3f3f3f] text-xs">·</span>
                  <span className="text-xs text-[#8e8e8e] tabular-nums">{formatTime(entry.timestamp)}</span>
                </span>

                {/* Chevron */}
                <svg
                  className={`w-3.5 h-3.5 text-[#8e8e8e] shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-[#3f3f3f] px-5 py-5 flex flex-col gap-5">
                  {/* Full prompt */}
                  <div>
                    <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium mb-2">Prompt</p>
                    <p className="text-xs text-[#b4b4b4] leading-relaxed bg-[#303030] border border-[#3f3f3f] rounded-xl px-4 py-3 whitespace-pre-wrap">
                      {entry.prompt}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Classification */}
                    <div>
                      <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium mb-3">Classification</p>
                      <div className="grid grid-cols-3 gap-2">
                        <StatTile label="Domain"     value={DOMAIN_LABELS[result.classification.domain]} />
                        <StatTile label="Complexity" value={COMPLEXITY_LABELS[result.classification.complexity]} />
                        <StatTile label="Confidence" value={`${Math.round(result.classification.confidence * 100)}%`} />
                      </div>
                    </div>

                    {/* Routing */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium">Routing</p>
                        {result.escalated && (
                          <span className="text-xs text-red-400 font-medium">escalated</span>
                        )}
                      </div>
                      <div className="rounded-xl border border-[#3f3f3f] px-4 divide-y divide-[#3f3f3f]">
                        <DetailRow label="Initial"><ModelDetail model={result.initialModel} /></DetailRow>
                        <DetailRow label="Final"><ModelDetail model={result.finalModel} /></DetailRow>
                        <DetailRow label="Latency">
                          <span className="text-xs text-[#8e8e8e] tabular-nums">{result.latencyMs} ms</span>
                        </DetailRow>
                        <DetailRow label="Cost">
                          <span className="font-mono text-xs text-[#8e8e8e]">${result.totalCostUsd.toFixed(6)}</span>
                        </DetailRow>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium mb-2">Reason</p>
                    <p className="text-xs text-[#b4b4b4] leading-relaxed">{result.finalModel.reason}</p>
                  </div>

                  {/* Output */}
                  <div>
                    <p className="text-[11px] text-[#8e8e8e] uppercase tracking-wide font-medium mb-2">Output</p>
                    <div className="bg-[#303030] border border-[#3f3f3f] rounded-xl px-4 py-3">
                      <div className="prose prose-invert prose-chat max-w-none text-[13px] leading-relaxed">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                        >
                          {result.response}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#303030] border border-[#3f3f3f] rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[11px] text-[#8e8e8e]">{label}</span>
      <span className="text-xs font-semibold text-[#ececec] truncate">{value}</span>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 last:pb-0 first:pt-0">
      <span className="text-xs text-[#8e8e8e] font-medium shrink-0">{label}</span>
      {children}
    </div>
  );
}
