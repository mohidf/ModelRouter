import { useState, type ReactNode } from 'react';
import PromptCard from './components/PromptCard';
import ResponsePanel from './components/ResponsePanel';
import MetricsPanel from './components/MetricsPanel';
import HistoryPanel from './components/HistoryPanel';
import InsightsPanel from './components/InsightsPanel';
import type { RouteResponse, HistoryEntry, OptimizationMode } from './types';

type Tab = 'prompt' | 'history' | 'metrics' | 'insights';

let nextId = 1;

export default function App() {
  const [tab, setTab] = useState<Tab>('prompt');
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  async function handleSubmit(
    prompt: string,
    options: { maxTokens?: number; preferCost: boolean; optimizationMode: OptimizationMode }
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...options }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Request failed.');
        setResult(null);
      } else {
        const routeResult = data as RouteResponse;
        setResult(routeResult);
        setHistory((prev) => {
          const entry: HistoryEntry = { id: nextId++, prompt, result: routeResult, timestamp: new Date() };
          return [entry, ...prev].slice(0, 10);
        });
      }
    } catch {
      setError('Could not reach the backend. Is it running?');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'prompt',   label: 'Prompt' },
    { id: 'history',  label: 'History', badge: history.length || undefined },
    { id: 'metrics',  label: 'Metrics' },
    { id: 'insights', label: 'Insights' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: 'rgba(10,10,15,0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--rim)',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #00d4ff 0%, #0066cc 100%)',
                borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 14px rgba(0,212,255,0.28)',
                flexShrink: 0,
              }}>
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.025em', color: '#f0f0f0' }}>
                ModelRouter
              </span>
              <span style={{
                fontSize: 10, fontWeight: 500,
                fontFamily: "'IBM Plex Mono', monospace",
                color: 'var(--accent)', backgroundColor: 'var(--accent-bg)',
                border: '1px solid rgba(0,212,255,0.22)',
                borderRadius: 4, padding: '1px 6px', letterSpacing: '0.07em',
              }}>AI</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--green)' }} />
              <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', letterSpacing: '0.08em' }}>LIVE</span>
            </div>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: -1 }}>
            {tabs.map(t => (
              <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} badge={t.badge}>
                {t.label}
              </TabBtn>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, maxWidth: 960, margin: '0 auto', width: '100%', padding: '32px 24px' }}>
        {tab === 'prompt' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <PromptCard onSubmit={handleSubmit} loading={loading} />
            {(loading || result || error) && (
              <div className="anim-fade-up">
                <ResponsePanel result={result} error={error} loading={loading} />
              </div>
            )}
          </div>
        ) : tab === 'history' ? (
          <HistoryPanel history={history} />
        ) : tab === 'metrics' ? (
          <MetricsPanel />
        ) : (
          <InsightsPanel />
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--rim)', padding: '14px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.03em', margin: 0 }}>
          ModelRouter AI — intelligent LLM routing via Together AI · OpenAI · Anthropic
        </p>
      </footer>
    </div>
  );
}

function TabBtn({ active, onClick, children, badge }: {
  active: boolean; onClick: () => void; children: ReactNode; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 14px', fontSize: 13,
        fontWeight: active ? 500 : 400,
        color: active ? '#f0f0f0' : 'var(--muted)',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        background: 'none', border: 'none',
        cursor: 'pointer',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        transition: 'color 0.13s ease',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#c0c0c0'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
    >
      {children}
      {badge != null && (
        <span style={{
          fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
          color: active ? 'var(--accent)' : '#555',
          backgroundColor: active ? 'var(--accent-bg)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${active ? 'rgba(0,212,255,0.22)' : 'var(--rim)'}`,
          borderRadius: 99, padding: '0 5px', lineHeight: '16px', display: 'inline-block',
        }}>{badge}</span>
      )}
    </button>
  );
}
