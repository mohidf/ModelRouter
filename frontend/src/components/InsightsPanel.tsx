import { useState, useEffect, useCallback } from 'react';
import type { InsightsResponse, TaskInsight, ScoredStats, ModelTier, TaskDomain } from '../types';
import { ALL_DOMAINS } from '../types';
import { modelDisplayName } from '../utils/modelDisplay';

const TIER_COLOR: Record<ModelTier, string> = {
  cheap: '#00ff88', balanced: '#00d4ff', premium: '#f59e0b',
};

const DOMAIN_META: Record<TaskDomain, { icon: string; color: string; label: string }> = {
  coding:        { icon: '{}',  color: '#00d4ff', label: 'Coding' },
  math:          { icon: '∑',  color: '#a78bfa', label: 'Math' },
  creative:      { icon: '✦',  color: '#f472b6', label: 'Creative' },
  general:       { icon: '◎',  color: '#34d399', label: 'General' },
  research:      { icon: '⊙',  color: '#60a5fa', label: 'Research' },
  summarization: { icon: '≡',  color: '#84cc16', label: 'Summarize' },
  vision:        { icon: '◈',  color: '#e879f9', label: 'Vision' },
  coding_debug:  { icon: '⚠',  color: '#f87171', label: 'Debug' },
  general_chat:  { icon: '◯',  color: '#2dd4bf', label: 'Chat' },
  multilingual:  { icon: 'Α',  color: '#fbbf24', label: 'Multilingual' },
  math_reasoning: { icon: '⊢', color: '#c084fc', label: 'Reasoning' },
};

const DOMAINS = ALL_DOMAINS;

// ── Score bar ──────────────────────────────────────────────────────────────

function ScoreBar({ score, maxScore = 3.0, chosen }: { score: number | null; maxScore?: number; chosen: boolean }) {
  const pct = score != null ? Math.min(Math.max(score / maxScore, 0), 1) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--rim)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 2,
          background: chosen ? 'var(--accent)' : 'var(--muted)',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
        color: chosen ? 'var(--accent)' : 'var(--muted)',
        minWidth: 32, textAlign: 'right',
      }}>
        {score != null ? score.toFixed(2) : '—'}
      </span>
    </div>
  );
}

// ── Option row ─────────────────────────────────────────────────────────────

function OptionRow({ stats, isWinner }: { stats: ScoredStats; isWinner: boolean }) {
  const tierColor = TIER_COLOR[stats.tier];
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 7,
      background: isWinner ? 'rgba(0,212,255,0.04)' : 'transparent',
      border: `1px solid ${isWinner ? 'rgba(0,212,255,0.15)' : 'transparent'}`,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isWinner && <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>▶</span>}
          <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: isWinner ? '#f0f0f0' : '#9ca3af' }}>
            {modelDisplayName(stats.modelId)}
          </span>
          <span style={{
            fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
            color: tierColor, background: `${tierColor}14`,
            border: `1px solid ${tierColor}33`,
            borderRadius: 3, padding: '1px 5px',
          }}>
            {stats.tier}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'conf', value: `${(stats.averageConfidence * 100).toFixed(0)}%` },
            { label: 'lat', value: `${Math.round(stats.averageLatencyMs)}ms` },
            { label: 'cost', value: `$${stats.averageCostUsd.toFixed(4)}` },
            { label: 'esc', value: `${(stats.escalationRate * 100).toFixed(0)}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <ScoreBar score={stats.score} chosen={isWinner} />
    </div>
  );
}

// ── Domain card ─────────────────────────────────────────────────────────────

function DomainCard({ insight, domain }: { insight: TaskInsight; domain: TaskDomain }) {
  const [showAll, setShowAll] = useState(false);
  const meta = DOMAIN_META[domain];
  const totalRequests = insight.all.reduce((s, x) => s + x.totalRequests, 0);
  const others = insight.all.slice(1);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--rim)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--rim)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 14, color: meta.color,
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${meta.color}14`,
            border: `1px solid ${meta.color}33`,
            borderRadius: 6,
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            {meta.icon}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#f0f0f0' }}>{meta.label}</span>
        </div>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>
          {totalRequests} req
        </span>
      </div>

      {!insight.best ? (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
            no data yet
          </p>
        </div>
      ) : (
        <div style={{ padding: '8px' }}>
          <OptionRow stats={insight.all[0]} isWinner />

          {others.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                style={{
                  width: '100%', padding: '5px 12px', marginTop: 3,
                  fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                  color: 'var(--muted)', background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  borderRadius: 6,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: showAll ? 'rotate(90deg)' : 'none' }}>▶</span>
                {showAll ? 'hide' : `+${others.length} more`}
              </button>
              {showAll && others.map(s => (
                <OptionRow key={s.modelId} stats={s} isWinner={false} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function InsightsPanel() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/performance');
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed.'); }
      else { setInsights(data as InsightsResponse); }
    } catch { setError('Could not reach the backend.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalDecisions = insights
    ? DOMAINS.reduce((s, d) => s + insights.byTaskType[d].all.reduce((x, y) => x + y.totalRequests, 0), 0)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: '#f0f0f0' }}>
            Optimization Insights
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
            Best provider + tier per task type, ranked by EMA score
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--muted)', background: 'var(--surface)',
            border: '1px solid var(--rim)',
            borderRadius: 7, cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--rim-hi)'; (e.currentTarget as HTMLElement).style.color = '#f0f0f0'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--rim)'; (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
        >
          <svg className={loading ? 'anim-spin' : ''} width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          refresh
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--red)', background: 'var(--red-bg)',
          border: '1px solid rgba(255,68,102,0.2)', borderRadius: 8,
        }}>{error}</div>
      )}

      {/* Skeleton */}
      {loading && !insights && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {DOMAINS.map(d => <div key={d} className="skeleton" style={{ height: 150, borderRadius: 10 }} />)}
        </div>
      )}

      {!loading && insights && (
        <>
          {/* Global stats pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatPill label="ε exploration" value={`${(insights.epsilon * 100).toFixed(0)}%`} />
            <StatPill label="total decisions" value={String(totalDecisions)} />
          </div>

          {/* Domain grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {DOMAINS.map(domain => (
              <DomainCard key={domain} domain={domain} insight={insights.byTaskType[domain]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      background: 'var(--surface)', border: '1px solid var(--rim)', borderRadius: 8,
    }}>
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: '#f0f0f0' }}>
        {value}
      </span>
    </div>
  );
}
