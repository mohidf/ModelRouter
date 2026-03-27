import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { RouteResponse, TaskComplexity, TaskDomain, ModelTier, EvaluatedOption } from '../types';
import { modelDisplayName } from '../utils/modelDisplay';

interface Props {
  result: RouteResponse | null;
  error: string | null;
  loading: boolean;
}

const DOMAIN_COLOR: Record<TaskDomain, string> = {
  coding:         'var(--d-coding)',
  math:           'var(--d-math)',
  creative:       'var(--d-creative)',
  general:        'var(--d-general)',
  research:       'var(--d-research)',
  summarization:  'var(--d-summ)',
  vision:         'var(--d-vision)',
  coding_debug:   'var(--d-debug)',
  general_chat:   'var(--d-chat)',
  multilingual:   'var(--d-multi)',
  math_reasoning: 'var(--d-reason)',
};

const TIER_COLOR: Record<ModelTier, string> = {
  cheap:    'var(--success)',
  balanced: 'var(--accent)',
  premium:  'var(--warning)',
};

const COMPLEXITY_LABEL: Record<TaskComplexity, string> = { low: 'Low', medium: 'Medium', high: 'High' };

// Shared column template for the options table header + rows.
// Using identical fixed widths in both ensures columns stay aligned.
// Model/tier col is wider to fit stacked name+chip; fixed cols kept compact
const OPTIONS_COLS = '1fr 52px 76px 76px 80px';

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="chip" style={{ color, background: `${color}14`, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

// ── Pipeline step ────────────────────────────────────────────────────────────

function Step({ num, label, children, delay = 0 }: { num: number; label: string; children: React.ReactNode; delay?: number }) {
  return (
    <div className="anim-fade-up" style={{
      animationDelay: `${delay}ms`,
      flex: 1, minWidth: 0,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{
          width: 18, height: 18, borderRadius: 4,
          background: 'var(--accent-subtle)',
          border: '1px solid var(--accent-ring)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
        }}>{num}</span>
        <span className="label">{label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}

function StepRow({ k, v, accent }: { k: string; v: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontSize: 9.5, color: 'var(--muted)',
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{k}</span>
      <span style={{
        fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
        color: accent ? 'var(--accent)' : 'var(--text)',
        wordBreak: 'break-word',
      }}>{v}</span>
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 26, color: 'var(--border-hi)', flexShrink: 0 }}>
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </div>
  );
}

// ── Options table row ─────────────────────────────────────────────────────────

function OptionRow({ opt, maxScore, chosen }: { opt: EvaluatedOption; maxScore: number; chosen: boolean }) {
  const pct = maxScore > 0 ? Math.min(Math.max(opt.score / maxScore, 0), 1) * 100 : 0;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: OPTIONS_COLS,
      alignItems: 'center', columnGap: 8,
      padding: '7px 14px', borderRadius: 5,
      background: chosen ? 'var(--accent-subtle)' : 'transparent',
      border: `1px solid ${chosen ? 'var(--accent-ring)' : 'transparent'}`,
    }}>
      {/* Model name (top) + tier chip (below) — stacked so name always visible */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
        <svg width="7" height="7" viewBox="0 0 10 10" fill="var(--accent)" aria-label={chosen ? 'Selected' : undefined} style={{ flexShrink: 0, marginTop: 3, visibility: chosen ? 'visible' : 'hidden' }}>
          <polygon points="0,0 10,5 0,10"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            color: chosen ? 'var(--text)' : 'var(--text-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={modelDisplayName(opt.modelId)}>
            {modelDisplayName(opt.modelId)}
          </span>
          <Chip label={opt.tier} color={TIER_COLOR[opt.tier]} />
        </div>
      </div>
      {/* Quality */}
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)', textAlign: 'right' }}>
        {(opt.averageConfidence * 100).toFixed(0)}%
      </span>
      {/* Latency */}
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)', textAlign: 'right' }}>
        {Math.round(opt.averageLatencyMs)}ms
      </span>
      {/* Cost */}
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)', textAlign: 'right' }}>
        ${opt.averageCostUsd.toFixed(5)}
      </span>
      {/* Score bar + value */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 99,
            background: chosen ? 'var(--accent)' : 'var(--muted)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
          color: chosen ? 'var(--accent)' : 'var(--muted)', minWidth: 28, textAlign: 'right',
        }}>
          {opt.score.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ResponsePanel({ result, error, loading }: Props) {
  const [showOptions, setShowOptions] = useState(true);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 500px', gap: 14, alignItems: 'start', width: '100%', height: '100%' }}>
        <div className="card" style={{ padding: 20 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 18, marginBottom: 10, width: `${85 - i * 10}%` }} />)}
        </div>
        <div className="card">
          <div style={{ padding: '12px', display: 'flex', gap: 8 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 80 }} />)}
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
            routing
            <span style={{ animation: 'blink 1s step-end infinite', display: 'inline-block', marginLeft: 2 }} aria-hidden="true">▋</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '14px 18px', borderLeft: '3px solid var(--danger)' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <svg width="15" height="15" fill="none" stroke="var(--danger)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', marginBottom: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Error</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)' }} role="alert">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { classification, initialModel, finalModel, escalated, strategyMode, evaluatedOptions, totalCostUsd, latencyMs } = result;
  const maxScore = evaluatedOptions.length > 0 ? Math.max(...evaluatedOptions.map(o => o.score)) : 0;

  const strategyColor = strategyMode === 'exploitation' ? 'var(--success)'
    : strategyMode === 'exploration' ? 'var(--warning)'
    : 'var(--muted)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 500px',
      gap: 14,
      alignItems: 'stretch',
      width: '100%',
      height: '100%',
      minHeight: 0,
    }}>

      {/* ── LEFT: Response text — inner div scrolls, card keeps its border-radius ── */}
      <div className="card anim-fade-in" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="response-scroll" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '20px 24px' }}>
            <div className="prose-router">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {result.response}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Pipeline + Evaluated options — independently scrollable ── */}
      <div className="response-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>

        {/* Pipeline card */}
        <div className="card anim-fade-up" style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <Step num={1} label="Classify">
              <StepRow k="domain"     v={<Chip label={classification.domain} color={DOMAIN_COLOR[classification.domain]} />} />
              <StepRow k="complexity" v={COMPLEXITY_LABEL[classification.complexity]} />
              <StepRow k="class conf" v={`${Math.round(classification.confidence * 100)}%`} accent={classification.confidence > 0.75} />
            </Step>
            <Arrow />
            <Step num={2} label="Route" delay={60}>
              <StepRow k="provider" v={initialModel.provider} />
              <StepRow k="tier"     v={<Chip label={initialModel.tier} color={TIER_COLOR[initialModel.tier]} />} />
              <StepRow k="strategy" v={<span style={{ color: strategyColor }}>{strategyMode}</span>} />
            </Step>
            <Arrow />
            <Step num={3} label="Execute" delay={120}>
              <StepRow k="model"   v={finalModel.model} />
              <StepRow k="latency" v={`${latencyMs}ms`} />
              <StepRow k="cost"    v={`$${totalCostUsd.toFixed(5)}`} accent />
            </Step>
          </div>

          {escalated && (
            <div style={{
              marginTop: 10, padding: '7px 12px',
              background: 'var(--warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <svg width="12" height="12" fill="none" stroke="var(--warning)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/>
              </svg>
              <span style={{ fontSize: 11, color: 'var(--warning)', fontFamily: "'JetBrains Mono', monospace" }}>
                Escalated → re-routed to {finalModel.provider}/{finalModel.tier}
              </span>
            </div>
          )}
        </div>

        {/* Evaluated options card */}
        {evaluatedOptions.length > 0 && (
          <div className="card">
            <button
              type="button"
              onClick={() => setShowOptions(v => !v)}
              aria-expanded={showOptions}
              className="hover-bg-2"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <span className="label">Evaluated options ({evaluatedOptions.length})</span>
              <svg
                width="12" height="12" fill="none" stroke="var(--muted)" strokeWidth="2.5" viewBox="0 0 24 24"
                aria-hidden="true"
                style={{ transition: 'transform 0.18s', transform: showOptions ? 'rotate(180deg)' : 'none' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {showOptions && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {/* Header — same column template as rows */}
                <div style={{
                  display: 'grid', gridTemplateColumns: OPTIONS_COLS,
                  columnGap: 8, padding: '6px 14px 6px',
                  background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
                }}>
                  {(['model / tier', 'quality', 'latency', 'cost', 'score'] as const).map((h, i) => (
                    <span key={h} className="label" style={{ textAlign: i > 0 ? 'right' : 'left', fontSize: 10 }}>{h}</span>
                  ))}
                </div>
                {/* Rows */}
                <div style={{ padding: '4px 0 6px' }}>
                  {evaluatedOptions.map(opt => (
                    <OptionRow
                      key={opt.modelId}
                      opt={opt}
                      maxScore={maxScore}
                      chosen={strategyMode === 'exploitation' && opt.modelId === initialModel.model}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
