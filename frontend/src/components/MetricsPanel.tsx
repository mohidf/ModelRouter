import { useState, useEffect } from 'react';
import type { MetricsSnapshot } from '../types';
import { API_BASE } from '../lib/api';

function Refresh({ spin }: { spin: boolean }) {
  return (
    <svg className={spin ? 'anim-spin' : ''} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
    </svg>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: 'danger' | 'success' | 'warning';
}

function StatCard({ label, value, sub, highlight }: StatCardProps) {
  const color = highlight === 'danger' ? 'var(--danger)'
    : highlight === 'success' ? 'var(--success)'
    : highlight === 'warning' ? 'var(--warning)'
    : 'var(--text)';

  const borderColor = highlight === 'danger' ? 'rgba(220,38,38,0.3)'
    : highlight === 'warning' ? 'rgba(217,119,6,0.3)'
    : 'var(--border)';

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: 'var(--shadow-sm)',
      position: 'relative', overflow: 'hidden',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: color, opacity: 0.7,
        }} aria-hidden="true" />
      )}
      <span className="label" style={{ fontSize: 11 }}>{label}</span>
      <span style={{
        fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em',
        color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
}

export default function MetricsPanel() {
  const [data, setData]       = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/metrics`);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Routing Metrics</h1>
          <p className="page-subtitle">In-process counters — resets on server restart</p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="btn btn-ghost"
          aria-label="Refresh metrics"
        >
          <Refresh spin={loading} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', fontSize: 13, color: 'var(--danger)',
          background: 'var(--danger-bg)', border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
          borderRadius: 'var(--radius-md)',
        }} role="alert">
          {error}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
      )}

      {data && (
        <>
          {/* Stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <StatCard label="Total Requests"  value={data.totalRequests.toLocaleString()}           sub="All time" />
            <StatCard
              label="Escalation Rate"
              value={`${data.escalationRatePercent}%`}
              sub={`${data.escalationCount} escalations`}
              highlight={data.escalationRatePercent > 30 ? 'danger' : data.escalationRatePercent > 15 ? 'warning' : undefined}
            />
            <StatCard label="Avg Latency"     value={`${data.averageLatencyMs}ms`}                  sub="Per request" />
            <StatCard label="Total Tokens"    value={data.totalTokens.toLocaleString()}              sub="Input + output" />
            <StatCard label="Est. Total Cost" value={`$${data.totalEstimatedCostUsd.toFixed(4)}`}   sub="USD" />
            <StatCard label="Models Used"     value={String(Object.keys(data.perModel).length)}      sub="Unique models" highlight={Object.keys(data.perModel).length > 0 ? 'success' : undefined} />
          </div>

          {/* Per-model table */}
          <div className="card">
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span className="label">Per Model Breakdown</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {Object.keys(data.perModel).length} model{Object.keys(data.perModel).length !== 1 ? 's' : ''}
              </span>
            </div>

            {Object.keys(data.perModel).length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <svg width="28" height="28" fill="none" stroke="var(--muted)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true" style={{ margin: '0 auto 10px', display: 'block' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>No model calls yet</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>Run some prompts to see per-model data.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {[
                        { h: 'Model', align: 'left' },
                        { h: 'Calls', align: 'right' },
                        { h: 'Avg Latency', align: 'right' },
                        { h: 'Total Tokens', align: 'right' },
                        { h: 'Cost', align: 'right' },
                      ].map(({ h, align }) => (
                        <th key={h} style={{
                          padding: '10px 18px', textAlign: align as 'left' | 'right',
                          fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: 'var(--muted)', background: 'var(--surface-2)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.perModel).map(([model, m], i, arr) => (
                      <tr
                        key={model}
                        className="hover-bg-2"
                        style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{
                            fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
                            color: 'var(--accent)',
                            background: 'var(--accent-subtle)', border: '1px solid var(--accent-ring)',
                            borderRadius: 'var(--radius-sm)', padding: '2px 8px',
                          }}>{model}</span>
                        </td>
                        <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--text)' }}>
                          {m.calls.toLocaleString()}
                        </td>
                        <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>
                          {m.averageLatencyMs.toLocaleString()}ms
                        </td>
                        <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>
                          {m.totalTokens.toLocaleString()}
                        </td>
                        <td style={{ padding: '11px 18px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>
                          ${m.totalCostUsd.toFixed(5)}
                        </td>
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
