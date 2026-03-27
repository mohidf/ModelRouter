import { useState, useEffect, useCallback } from 'react';
import type { InsightsResponse, TaskInsight, ScoredStats, ModelTier, TaskDomain } from '../types';
import { API_BASE } from '../lib/api';
import { ALL_DOMAINS } from '../types';
import { modelDisplayName } from '../utils/modelDisplay';

const TIER_COLOR: Record<ModelTier, string> = {
  cheap: 'var(--success)', balanced: 'var(--accent)', premium: 'var(--warning)',
};

type DomainMeta = { color: string; label: string; icon: React.ReactNode };

function I(d: string) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, string> = {
    coding:         'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    math:           'M12 4v16m8-8H4',
    creative:       'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    general:        'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064',
    research:       'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    summarization:  'M4 6h16M4 12h16M4 18h7',
    vision:         'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    coding_debug:   'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    general_chat:   'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    multilingual:   'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129',
    math_reasoning: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  };
  return <svg width="13" height="13" viewBox="0 0 24 24" {...s} aria-hidden="true"><path d={paths[d] ?? ''}/></svg>;
}

const DOMAIN_META: Record<TaskDomain, DomainMeta> = {
  coding:         { color: 'var(--d-coding)',  label: 'Coding',       icon: I('coding') },
  math:           { color: 'var(--d-math)',    label: 'Math',         icon: I('math') },
  creative:       { color: 'var(--d-creative)',label: 'Creative',     icon: I('creative') },
  general:        { color: 'var(--d-general)', label: 'General',      icon: I('general') },
  research:       { color: 'var(--d-research)',label: 'Research',     icon: I('research') },
  summarization:  { color: 'var(--d-summ)',    label: 'Summarize',    icon: I('summarization') },
  vision:         { color: 'var(--d-vision)',  label: 'Vision',       icon: I('vision') },
  coding_debug:   { color: 'var(--d-debug)',   label: 'Debug',        icon: I('coding_debug') },
  general_chat:   { color: 'var(--d-chat)',    label: 'Chat',         icon: I('general_chat') },
  multilingual:   { color: 'var(--d-multi)',   label: 'Multilingual', icon: I('multilingual') },
  math_reasoning: { color: 'var(--d-reason)', label: 'Reasoning',    icon: I('math_reasoning') },
};

// ── Score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ score, winner }: { score: number | null; winner: boolean }) {
  const pct = score != null ? Math.min(Math.max(score / 3, 0), 1) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 99,
          background: winner ? 'var(--accent)' : 'var(--muted)',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        color: winner ? 'var(--accent)' : 'var(--muted)', minWidth: 32, textAlign: 'right',
      }}>
        {score != null ? score.toFixed(2) : '—'}
      </span>
    </div>
  );
}

// ── Option row ────────────────────────────────────────────────────────────

function OptionRow({ stats, winner }: { stats: ScoredStats; winner: boolean }) {
  const tc = TIER_COLOR[stats.tier];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 'var(--radius-sm)',
      background: winner ? 'var(--accent-subtle)' : 'transparent',
      border: `1px solid ${winner ? 'var(--accent-ring)' : 'transparent'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {winner && (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="var(--accent)" aria-label="Winner" style={{ flexShrink: 0 }}>
              <polygon points="0,0 10,5 0,10"/>
            </svg>
          )}
          <span style={{
            fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
            color: winner ? 'var(--text)' : 'var(--text-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {modelDisplayName(stats.modelId)}
          </span>
          <span style={{
            fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
            color: tc, background: `${tc}14`, border: `1px solid ${tc}28`,
            borderRadius: 4, padding: '1px 6px', flexShrink: 0,
          }}>{stats.tier}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {([
            ['CONF', `${(stats.averageConfidence * 100).toFixed(0)}%`],
            ['LAT',  `${Math.round(stats.averageLatencyMs)}ms`],
            ['COST', `$${stats.averageCostUsd.toFixed(4)}`],
            ['ESC',  `${(stats.escalationRate * 100).toFixed(0)}%`],
          ] as [string, string][]).map(([lbl, val]) => (
            <div key={lbl} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{lbl}</div>
              <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <ScoreBar score={stats.score} winner={winner} />
    </div>
  );
}

// ── Domain card ──────────────────────────────────────────────────────────

function DomainCard({ domain, insight }: { domain: TaskDomain; insight: TaskInsight }) {
  const [showAll, setShowAll] = useState(false);
  const { color, label, icon } = DOMAIN_META[domain];
  const totalReq = insight.all.reduce((s, x) => s + x.totalRequests, 0);
  const others   = insight.all.slice(1);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color, background: `${color}14`, border: `1px solid ${color}28`,
          }}>{icon}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        </div>
        <span style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: 'var(--muted)' }}>
          {totalReq} req
        </span>
      </div>

      {/* Body */}
      {!insight.best ? (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>No data yet</p>
        </div>
      ) : (
        <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <OptionRow stats={insight.all[0]} winner />
          {others.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                aria-expanded={showAll}
                className="hover-bg-3"
                style={{
                  width: '100%', padding: '6px 14px',
                  fontSize: 12, color: 'var(--text-2)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <svg
                  width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ transition: 'transform 0.15s', transform: showAll ? 'rotate(90deg)' : 'none' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
                {showAll ? 'Hide' : `+${others.length} more`}
              </button>
              {showAll && others.map(s => <OptionRow key={s.modelId} stats={s} winner={false} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function InsightsPanel() {
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${API_BASE}/performance`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed.');
      else setInsights(data as InsightsResponse);
    } catch { setError('Could not reach the backend.'); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalDecisions = insights
    ? ALL_DOMAINS.reduce((s, d) => s + (insights.byTaskType[d]?.all ?? []).reduce((x, y) => x + y.totalRequests, 0), 0)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Optimization Insights</h1>
          <p className="page-subtitle">Best provider + tier per task type, ranked by EMA score</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="btn btn-ghost"
          aria-label="Refresh insights"
        >
          <svg className={loading ? 'anim-spin' : ''} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)', borderRadius: 'var(--radius-md)' }} role="alert">
          {error}
        </div>
      )}

      {loading && !insights && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {ALL_DOMAINS.map(d => <div key={d} className="skeleton" style={{ height: 140 }} />)}
        </div>
      )}

      {!loading && insights && (
        <>
          {/* Global pills */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'ε Exploration', value: `${(insights.epsilon * 100).toFixed(0)}%` },
              { label: 'Total Decisions', value: String(totalDecisions) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)',
              }}>
                <span className="label">{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Domain grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ALL_DOMAINS.map(domain => (
              <DomainCard
                key={domain}
                domain={domain}
                insight={insights.byTaskType[domain] ?? { best: null, bestScore: null, all: [] }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
