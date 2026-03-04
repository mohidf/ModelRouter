import { useState, type ReactNode } from 'react';
import PromptCard from './components/PromptCard';
import ResponsePanel from './components/ResponsePanel';
import MetricsPanel from './components/MetricsPanel';
import HistoryPanel from './components/HistoryPanel';
import InsightsPanel from './components/InsightsPanel';
import type { RouteResponse, HistoryEntry, OptimizationMode } from './types';

type Tab = 'prompt' | 'metrics' | 'insights';

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

  return (
    <div className="min-h-screen bg-[#212121] text-[#ececec] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#3f3f3f] sticky top-0 z-10 bg-[#212121]">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-[#ececec] tracking-tight">ModelRouter</span>
            </div>
            <span className="text-xs text-[#8e8e8e]">Live</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 -mb-px">
            <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')}>Prompt</TabButton>
            <TabButton active={tab === 'metrics'} onClick={() => setTab('metrics')}>Metrics</TabButton>
            <TabButton active={tab === 'insights'} onClick={() => setTab('insights')}>Insights</TabButton>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {tab === 'prompt' ? (
          <>
            <PromptCard onSubmit={handleSubmit} loading={loading} />
            {(loading || result || error) && (
              <ResponsePanel result={result} error={error} loading={loading} />
            )}
            <HistoryPanel history={history} />
          </>
        ) : tab === 'metrics' ? (
          <MetricsPanel />
        ) : (
          <InsightsPanel />
        )}
      </main>

      <footer className="border-t border-[#3f3f3f] py-4 px-6">
        <p className="text-xs text-[#8e8e8e] text-center max-w-3xl mx-auto">
          ModelRouter AI — intelligent LLM routing via OpenAI and Anthropic.
        </p>
      </footer>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-emerald-500 text-[#ececec]'
          : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4]'
      }`}
    >
      {children}
    </button>
  );
}
