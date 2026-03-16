import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { OptimizationMode } from '../types';

interface Props {
  onSubmit: (prompt: string, options: { maxTokens?: number; optimizationMode: OptimizationMode }) => void;
  loading: boolean;
}

const MODES: { value: OptimizationMode; label: string; title: string }[] = [
  { value: 'cost',     label: 'Cost',     title: 'Minimize spend' },
  { value: 'balanced', label: 'Balanced', title: 'Cost + quality' },
  { value: 'quality',  label: 'Quality',  title: 'Best accuracy' },
];

export default function PromptCard({ onSubmit, loading }: Props) {
  const [prompt, setPrompt]       = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [mode, setMode]           = useState<OptimizationMode>('balanced');
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const tokenEst = Math.ceil(prompt.length / 4);
  const canSubmit = prompt.trim().length > 0 && !loading;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(prompt, {
      optimizationMode: mode,
      maxTokens: maxTokens !== '' ? parseInt(maxTokens, 10) : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="chat-input-form">

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as unknown as FormEvent);
        }}
        placeholder="Ask anything — code, math, creative, research, or general…"
        aria-label="Prompt input"
        rows={3}
        className="chat-textarea"
        style={{ display: 'block', minHeight: 72 }}
      />

      {/* Controls row */}
      <div className="chat-controls">

        {/* Left: mode pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} role="group" aria-label="Routing mode">
          {MODES.map(m => (
            <button
              key={m.value}
              type="button"
              title={m.title}
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`chat-mode-btn${mode === m.value ? ' selected' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Right: token counter + max tokens + submit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Token estimate */}
          {prompt.length > 0 && (
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: 'nowrap',
            }}>
              ~{tokenEst}
            </span>
          )}

          {/* Max tokens */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Max</span>
            <input
              type="number"
              value={maxTokens}
              onChange={e => setMaxTokens(e.target.value)}
              placeholder="4096"
              min={1}
              max={32000}
              aria-label="Maximum tokens"
              style={{
                width: 60, padding: '2px 6px', fontSize: 11.5,
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'right', borderRadius: 'var(--radius-sm)',
              }}
            />
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary"
            style={{ padding: '5px 14px', fontSize: 12.5, borderRadius: 'var(--radius-md)' }}
          >
            {loading ? (
              <>
                <svg className="anim-spin" width="12" height="12" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3"/>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Routing
              </>
            ) : (
              <>
                Route
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
