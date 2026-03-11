import { useState, useEffect } from 'react';
import type { MetricsSnapshot } from '../types';

export default function MetricsPanel() {
  const [data, setData] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error('Failed to fetch metrics');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchMetrics(); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: '#f0f0f0' }}>
            Routing Metrics
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
            In-process counters — resets on server restart
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'var(--muted)',
            background: 'var(--surface)',
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
          {loading ? 'loading…' : 'refresh'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--red)', background: 'var(--red-bg)',
          border: '1px solid rgba(255,68,102,0.2)', borderRadius: 8,
        }}>
          {error}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <StatCard label="Total Requests"  value={data.totalRequests.toLocaleString()}       sub="all time" />
            <StatCard label="Escalation Rate" value={`${data.escalationRatePercent}%`}           sub={`${data.escalationCount} escalations`} accent={data.escalationRatePercent > 20} />
            <StatCard label="Avg Latency"     value={`${data.averageLatencyMs}ms`}               sub="per request" />
            <StatCard label="Total Tokens"    value={data.totalTokens.toLocaleString()}           sub="in + out" />
            <StatCard label="Est. Cost"       value={`$${data.totalEstimatedCostUsd.toFixed(4)}`} sub="USD total" />
            <StatCard label="Models Used"     value={String(Object.keys(data.perModel).length)}  sub="unique models" />
          </div>

          {/* Per-model table */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--rim)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--rim)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                Per Model
              </span>
            </div>

            {Object.keys(data.perModel).length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No model calls yet — run some prompts</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--rim)' }}>
                      {['Model', 'Calls', 'Avg Latency', 'Tokens', 'Cost'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px',
                          textAlign: h === 'Model' ? 'left' : 'right',
                          fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                          color: 'var(--muted)', letterSpacing: '0.09em', textTransform: 'uppercase',
                          fontWeight: 500,
                          backgroundColor: 'rgba(255,255,255,0.02)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.perModel).map(([model, m], i) => (
                      <tr key={model}
                        style={{ borderBottom: i < Object.keys(data.perModel).length - 1 ? '1px solid var(--rim)' : 'none' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{
                            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
                            color: 'var(--accent)',
                            background: 'var(--accent-bg)',
                            border: '1px solid rgba(0,212,255,0.15)',
                            borderRadius: 4, padding: '2px 7px',
                          }}>{model}</span>
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#e0e0e8' }}>{m.calls}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>{m.averageLatencyMs}ms</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>{m.totalTokens.toLocaleString()}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>${m.totalCostUsd.toFixed(5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${accent ? 'rgba(255,68,102,0.25)' : 'var(--rim)'}`,
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{
        fontSize: 22, fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
        letterSpacing: '-0.03em', color: accent ? 'var(--red)' : '#f0f0f0',
        lineHeight: 1.1,
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {sub}
        </span>
      )}
    </div>
  );
}
