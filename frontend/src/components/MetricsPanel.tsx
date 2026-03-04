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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#ececec] tracking-tight">Metrics</h2>
          <p className="text-xs text-[#8e8e8e] mt-0.5">Real-time routing statistics (in-memory).</p>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="text-xs font-medium text-[#8e8e8e] hover:text-[#ececec] border border-[#3f3f3f] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 bg-[#2f2f2f]"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#3f3f3f] border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Requests"  value={data.totalRequests.toLocaleString()} />
            <StatCard label="Escalation Rate" value={`${data.escalationRatePercent}%`} />
            <StatCard label="Total Tokens"    value={data.totalTokens.toLocaleString()} />
            <StatCard label="Est. Cost"       value={`$${data.totalEstimatedCostUsd.toFixed(4)}`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Escalations" value={data.escalationCount.toLocaleString()} />
            <StatCard label="Avg Latency"  value={`${data.averageLatencyMs} ms`} />
          </div>

          {/* Per-model table */}
          <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl overflow-hidden">
            <div className="px-6 py-3.5 border-b border-[#3f3f3f]">
              <p className="text-xs font-medium text-[#8e8e8e] uppercase tracking-wide">Per Model</p>
            </div>
            {Object.keys(data.perModel).length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-[#8e8e8e]">
                No model calls recorded yet. Run some prompts first.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#3f3f3f] bg-[#303030]">
                      <th className="text-left px-6 py-3 font-medium text-[#8e8e8e] uppercase tracking-wide">Model</th>
                      <th className="text-right px-6 py-3 font-medium text-[#8e8e8e] uppercase tracking-wide">Calls</th>
                      <th className="text-right px-6 py-3 font-medium text-[#8e8e8e] uppercase tracking-wide">Avg Latency</th>
                      <th className="text-right px-6 py-3 font-medium text-[#8e8e8e] uppercase tracking-wide">Tokens</th>
                      <th className="text-right px-6 py-3 font-medium text-[#8e8e8e] uppercase tracking-wide">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3f3f3f]">
                    {Object.entries(data.perModel).map(([model, m]) => (
                      <tr key={model} className="hover:bg-[#303030] transition-colors">
                        <td className="px-6 py-3">
                          <span className="font-mono text-[#b4b4b4] bg-[#303030] border border-[#3f3f3f] px-1.5 py-0.5 rounded">
                            {model}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-[#8e8e8e] tabular-nums">{m.calls}</td>
                        <td className="px-6 py-3 text-right text-[#8e8e8e] tabular-nums">{m.averageLatencyMs} ms</td>
                        <td className="px-6 py-3 text-right text-[#8e8e8e] tabular-nums">{m.totalTokens.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right text-[#8e8e8e] tabular-nums font-mono">${m.totalCostUsd.toFixed(6)}</td>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl px-5 py-4 flex flex-col gap-1.5">
      <span className="text-xs text-[#8e8e8e] font-medium">{label}</span>
      <span className="text-xl font-semibold text-[#ececec] tracking-tight tabular-nums">{value}</span>
    </div>
  );
}
