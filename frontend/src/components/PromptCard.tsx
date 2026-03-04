import { useState, type FormEvent } from 'react';
import type { OptimizationMode } from '../types';

interface Props {
  onSubmit: (prompt: string, options: { maxTokens?: number; preferCost: boolean; optimizationMode: OptimizationMode }) => void;
  loading: boolean;
}

export default function PromptCard({ onSubmit, loading }: Props) {
  const [prompt, setPrompt] = useState('');
  const [preferCost, setPreferCost] = useState(false);
  const [maxTokens, setMaxTokens] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('balanced');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    onSubmit(prompt, {
      preferCost,
      optimizationMode,
      maxTokens: maxTokens !== '' ? parseInt(maxTokens, 10) : undefined,
    });
  }

  return (
    <div className="bg-[#2f2f2f] border border-[#3f3f3f] rounded-xl p-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask anything — code, math, creative writing, or general questions..."
          rows={5}
          className="w-full bg-[#303030] border border-[#3f3f3f] rounded-lg px-4 py-3 text-sm text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none leading-relaxed"
        />

        {/* Options toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-[#8e8e8e] hover:text-[#b4b4b4] transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Options
          </button>

          {showOptions && (
            <div className="mt-3 flex flex-col gap-4 border border-[#3f3f3f] rounded-lg px-4 py-4 bg-[#212121]">
              {/* Max tokens */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-[#b4b4b4]">Max tokens</label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  placeholder="1024"
                  min={1}
                  max={32000}
                  className="w-28 bg-[#303030] border border-[#3f3f3f] rounded-lg px-3 py-1.5 text-xs text-[#ececec] text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Prefer cost */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#b4b4b4]">Prefer cost</span>
                  <p className="text-xs text-[#8e8e8e] mt-0.5">Downgrade model tier to reduce cost</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreferCost((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    preferCost ? 'bg-emerald-600' : 'bg-[#3f3f3f]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                      preferCost ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Optimization mode */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-[#b4b4b4]">Optimization</span>
                  <p className="text-xs text-[#8e8e8e] mt-0.5">Scoring weight preset for model selection</p>
                </div>
                <div className="flex border border-[#3f3f3f] rounded-lg overflow-hidden shrink-0">
                  {(['cost', 'balanced', 'quality'] as OptimizationMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOptimizationMode(mode)}
                      className={`px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                        optimizationMode === mode
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#303030] text-[#8e8e8e] hover:text-[#ececec]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          className="w-full bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Routing...
            </>
          ) : (
            'Route →'
          )}
        </button>
      </form>
    </div>
  );
}
