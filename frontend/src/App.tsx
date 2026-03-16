import { useState, useEffect, type ReactNode } from 'react';
import PromptCard from './components/PromptCard';
import ResponsePanel from './components/ResponsePanel';
import MetricsPanel from './components/MetricsPanel';
import HistoryPanel from './components/HistoryPanel';
import InsightsPanel from './components/InsightsPanel';
import type { RouteResponse, HistoryEntry, OptimizationMode } from './types';

type Theme = 'light' | 'dark';
type Tab = 'prompt' | 'history' | 'metrics' | 'insights';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconRoute()    { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>; }
function IconHistory()  { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>; }
function IconMetrics()  { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>; }
function IconInsights() { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>; }
function IconSun()      { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>; }
function IconMoon()     { return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>; }

const TAB_META: Record<Tab, { label: string; icon: ReactNode }> = {
  prompt:   { label: 'Prompt',   icon: <IconRoute /> },
  history:  { label: 'History',  icon: <IconHistory /> },
  metrics:  { label: 'Metrics',  icon: <IconMetrics /> },
  insights: { label: 'Insights', icon: <IconInsights /> },
};

const TABS: Tab[] = ['prompt', 'history', 'metrics', 'insights'];

// ── Welcome screen ────────────────────────────────────────────────────────────

function ChatWelcome() {
  return (
    <div className="chat-welcome">
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: 'var(--surface-3)',
        border: '1px solid var(--border-hi)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" fill="none" stroke="var(--text)" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text)' }}>
          ModelRouter AI
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Routes your prompt to the optimal model based on task type, cost, and quality.
        </p>
      </div>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4,
      }}>
        {['Code', 'Math', 'Creative', 'Research', 'General'].map(tag => (
          <span key={tag} style={{
            fontSize: 12, padding: '4px 12px',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 99, color: 'var(--text-2)',
          }}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]       = useState<Tab>('prompt');
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [theme, setTheme]   = useState<Theme>(() => {
    return (localStorage.getItem('mr-theme') as Theme | null) ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mr-theme', theme);
  }, [theme]);

  async function handleSubmit(
    prompt: string,
    options: { maxTokens?: number; optimizationMode: OptimizationMode }
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
        setHistory(prev => {
          const entry: HistoryEntry = {
            id: crypto.randomUUID(), prompt, result: routeResult, timestamp: new Date(),
          };
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

  const isDark = theme === 'dark';

  return (
    <div className="app-shell">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-hi)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="13" height="13" fill="none" stroke="var(--text)" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.025em', color: 'var(--text)' }}>
              ModelRouter
            </span>
          </div>

          {/* Mobile tabs */}
          <nav className="mobile-tabs" style={{ height: '100%' }} aria-label="Navigation">
            {TABS.map(t => (
              <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {TAB_META[t].label}
              </button>
            ))}
          </nav>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Theme toggle */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-2)',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
              }}
            >
              {isDark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* Sidebar */}
        <aside className="app-sidebar" aria-label="Navigation">
          <div className="nav-section">
            {TABS.map(t => (
              <button
                key={t}
                className={`nav-btn${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
              >
                {TAB_META[t].icon}
                {TAB_META[t].label}
                {t === 'history' && history.length > 0 && (
                  <span className="nav-badge">{history.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Sidebar footer */}
          <div style={{ marginTop: 'auto', padding: '16px 12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, padding: '0 2px' }}>
              <div style={{ fontWeight: 500, color: 'var(--text-2)', marginBottom: 2 }}>Providers</div>
              Together AI · OpenAI · Anthropic
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className={`app-main${tab === 'prompt' ? ' is-chat' : ''}`} id="main-content">

          {tab === 'prompt' && (
            <div className="chat-layout">
              <div className="chat-messages">
                {!result && !loading && !error
                  ? <ChatWelcome />
                  : <div className="anim-fade-in" style={{ height: '100%' }}><ResponsePanel result={result} error={error} loading={loading} /></div>
                }
              </div>
              <div className="chat-input-footer">
                <PromptCard onSubmit={handleSubmit} loading={loading} />
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="page-content" style={{ maxWidth: 800 }}>
              <HistoryPanel history={history} />
            </div>
          )}

          {tab === 'metrics' && (
            <div className="page-content">
              <MetricsPanel />
            </div>
          )}

          {tab === 'insights' && (
            <div style={{ padding: '32px 36px', width: '100%' }}>
              <InsightsPanel />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
