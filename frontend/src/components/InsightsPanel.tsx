import { useState, useEffect, useCallback } from 'react';
import type { InsightsResponse, TaskInsight, ScoredStats, ModelTier, TaskDomain } from '../types';

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<ModelTier, string> = {
  cheap: 'Cheap', balanced: 'Balanced', premium: 'Premium',
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic',
};

const DOMAIN_LABELS: Record<TaskDomain, string> = {
  coding: 'Coding', math: 'Math', creative: 'Creative', general: 'General',
};

const DOMAINS: TaskDomain[] = ['coding', 'math', 'creative', 'general'];

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
// Option row — compact single-line format
// ---------------------------------------------------------------------------

function OptionRow({ stats, isWinner }: { stats: ScoredStats; isWinner: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
      isWinner ? 'bg-emerald-900/20 border border-emerald-800/60' : 'hover:bg-[#303030] transition-colors'
    }`}>
      <span className={`text-sm w-4 text-center shrink-0 select-none ${isWinner ? 'text-emerald-400' : 'text-transparent'}`}>
        ⭐
      </span>
      <ProviderBadge provider={stats.provider} />
      <TierBadge tier={stats.tier} />
      <span className="flex-1 text-xs text-[#8e8e8e] tabular-nums">
        {(stats.averageConfidence * 100).toFixed(0)}% conf
        <span className="text-[#3f3f3f] mx-1">·</span>
        {Math.round(stats.averageLatencyMs)} ms
        <span className="text-[#3f3f3f] mx-1">·</span>
        <span className="font-mono">${stats.averageCostUsd.toFixed(6)}</span>
        <span className="text-[#3f3f3f] mx-1">·</span>
        {(stats.escalationRate * 100).toFixed(0)}% esc
      </span>
      <span className={`text-xs font-mono font-semibold shrink-0 ${isWinner ? 'text-emerald-400' : 'text-[#8e8e8e]'}`}>
        {stats.score != null ? stats.score.toFixed(3) : '—'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain card
// ---------------------------------------------------------------------------

function DomainCard({ insight, domain }: { insight: TaskInsight; domain: TaskDomain }) {
  const [showOthers, setShowOthers] = useState(false);
  const totalRequests = insight.all.reduce((sum, s) => sum + s.totalRequests, 0);
  const others = insight.all.slice(1);

  return (
    <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-[#3f3f3f] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#ececec]">{DOMAIN_LABELS[domain]}</span>
        <span className="text-xs text-[#8e8e8e] tabular-nums">
          {totalRequests} {totalRequests === 1 ? 'request' : 'requests'}
        </span>
      </div>

      {!insight.best ? (
        <div className="px-5 py-8 flex items-center justify-center">
          <p className="text-xs text-[#8e8e8e]">No routing decisions recorded yet.</p>
        </div>
      ) : (
        <div className="px-3 py-3 flex flex-col gap-1">
          {/* Best option — always shown, highlighted */}
          <OptionRow stats={insight.all[0]} isWinner />

          {/* Score label under best */}
          <p className="text-[11px] text-[#8e8e8e] px-3">
            Score: <span className="font-mono text-emerald-400">{insight.best.score != null ? insight.best.score.toFixed(3) : '—'}</span>
          </p>

          {/* Other options — collapsible */}
          {others.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-[#8e8e8e] hover:text-[#b4b4b4] transition-colors"
              >
                <svg
                  className={`w-2.5 h-2.5 transition-transform shrink-0 ${showOthers ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Other Options ({others.length})
              </button>

              {showOthers && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {others.map((s) => (
                    <OptionRow key={`${s.provider}:${s.tier}`} stats={s} isWinner={false} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function InsightsPanel() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/performance');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to load insights.');
      } else {
        setInsights(data as InsightsResponse);
      }
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#ececec] tracking-tight">Optimization Insights</h2>
          <p className="text-xs text-[#8e8e8e] mt-0.5">
            Best provider + tier per task type, ranked by strategy score.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-[#8e8e8e] hover:text-[#ececec] border border-[#3f3f3f] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 bg-[#2f2f2f]"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !insights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DOMAINS.map(d => (
            <div key={d} className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl p-5 h-40 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && insights && (
        <>
          {/* Global stats */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-[#2f2f2f] border border-[#3f3f3f] rounded-lg px-3 py-2">
              <span className="text-xs text-[#8e8e8e] font-medium">Exploration rate</span>
              <span className="font-mono text-sm font-semibold text-[#ececec]">
                ε = {(insights.epsilon * 100).toFixed(0)}%
              </span>
            </div>
            <div className="inline-flex items-center gap-2 bg-[#2f2f2f] border border-[#3f3f3f] rounded-lg px-3 py-2">
              <span className="text-xs text-[#8e8e8e] font-medium">Total decisions</span>
              <span className="font-mono text-sm font-semibold text-[#ececec]">
                {DOMAINS.reduce(
                  (sum, d) => sum + insights.byTaskType[d].all.reduce((s, x) => s + x.totalRequests, 0),
                  0,
                )}
              </span>
            </div>
          </div>

          {/* Domain cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DOMAINS.map(domain => (
              <DomainCard key={domain} domain={domain} insight={insights.byTaskType[domain]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
