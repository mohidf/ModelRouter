import { useState, useRef, type FormEvent } from 'react';
import type { OptimizationMode } from '../types';

interface Props {
  onSubmit: (prompt: string, options: { maxTokens?: number; preferCost: boolean; optimizationMode: OptimizationMode }) => void;
  loading: boolean;
}

const MODES: OptimizationMode[] = ['cost', 'balanced', 'quality'];

const MODE_DESC: Record<OptimizationMode, string> = {
  cost:     'Minimize spend',
  balanced: 'Cost + quality',
  quality:  'Best accuracy',
};

export default function PromptCard({ onSubmit, loading }: Props) {
  const [prompt, setPrompt] = useState('');
  const [preferCost, setPreferCost] = useState(false);
  const [maxTokens, setMaxTokens] = useState('');
  const [mode, setMode] = useState<OptimizationMode>('balanced');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = prompt.length;
  const tokenEst  = Math.ceil(charCount / 4);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    onSubmit(prompt, {
      preferCost,
      optimizationMode: mode,
      maxTokens: maxTokens !== '' ? parseInt(maxTokens, 10) : undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--rim)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--rim)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 500,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--muted)', letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          prompt.txt
        </span>
        <span style={{
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          color: charCount > 0 ? 'var(--muted)' : 'var(--dim)',
        }}>
          {charCount > 0 ? `~${tokenEst} tokens` : '0 tokens'}
        </span>
      </div>

      {/* ── Textarea ── */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as unknown as FormEvent);
          }}
          placeholder="Ask anything — code, math, creative, or general…"
          rows={6}
          style={{
            width: '100%',
            padding: '16px 18px',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: 13.5,
            fontFamily: "'IBM Plex Mono', monospace",
            lineHeight: 1.7,
            color: '#e8e8f0',
            caretColor: 'var(--accent)',
          }}
        />
        {/* placeholder hint */}
        {!prompt && (
          <div style={{
            position: 'absolute', bottom: 10, right: 14,
            fontSize: 10, color: 'var(--muted)',
            fontFamily: "'IBM Plex Mono', monospace",
            pointerEvents: 'none',
          }}>
            ⌘↵ to run
          </div>
        )}
      </div>

      {/* ── Options bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--rim)',
        backgroundColor: 'rgba(0,0,0,0.2)',
      }}>
        {/* Optimization mode pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {MODES.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              title={MODE_DESC[m]}
              style={{
                padding: '3px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: mode === m ? 500 : 400,
                fontFamily: "'IBM Plex Mono', monospace",
                color: mode === m ? 'var(--accent)' : 'var(--muted)',
                backgroundColor: mode === m ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${mode === m ? 'rgba(0,212,255,0.25)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 16, backgroundColor: 'var(--rim)', flexShrink: 0 }} />

        {/* Prefer cost toggle */}
        <button
          type="button"
          onClick={() => setPreferCost(v => !v)}
          title="Downgrade model tier to reduce cost"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px',
            borderRadius: 99,
            fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace",
            color: preferCost ? 'var(--green)' : 'var(--muted)',
            backgroundColor: preferCost ? 'var(--green-bg)' : 'transparent',
            border: `1px solid ${preferCost ? 'rgba(0,255,136,0.25)' : 'transparent'}`,
            cursor: 'pointer',
            transition: 'all 0.12s ease',
          }}
        >
          <span style={{ fontSize: 10 }}>⚡</span>
          prefer-cost
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 16, backgroundColor: 'var(--rim)', flexShrink: 0 }} />

        {/* Max tokens */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>max</span>
          <input
            type="number"
            value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)}
            placeholder="1024"
            min={1}
            max={32000}
            style={{
              width: 64,
              padding: '2px 6px',
              background: 'var(--surface-2)',
              border: '1px solid var(--rim)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
              color: '#e0e0e8',
              outline: 'none',
              textAlign: 'right',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--rim-hi)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--rim)'; }}
          />
          <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>tok</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Submit */}
        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 18px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: '#0a0a0f',
            background: !prompt.trim() || loading
              ? 'rgba(0,212,255,0.3)'
              : 'linear-gradient(135deg, #00d4ff 0%, #0099dd 100%)',
            border: 'none',
            cursor: !prompt.trim() || loading ? 'not-allowed' : 'pointer',
            opacity: !prompt.trim() || loading ? 0.5 : 1,
            transition: 'all 0.15s ease',
            boxShadow: !prompt.trim() || loading ? 'none' : '0 0 12px rgba(0,212,255,0.25)',
          }}
          onMouseEnter={e => {
            if (prompt.trim() && !loading) {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 20px rgba(0,212,255,0.4)';
            }
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.boxShadow = prompt.trim() && !loading
              ? '0 0 12px rgba(0,212,255,0.25)' : 'none';
          }}
        >
          {loading ? (
            <>
              <svg className="anim-spin" width="12" height="12" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Routing…
            </>
          ) : (
            <>Route →</>
          )}
        </button>
      </div>
    </form>
  );
}
