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
  coding:        '#00d4ff',
  math:          '#a78bfa',
  creative:      '#f472b6',
  general:       '#34d399',
  research:      '#60a5fa',
  summarization: '#84cc16',
  vision:        '#e879f9',
  coding_debug:  '#f87171',
  general_chat:  '#2dd4bf',
  multilingual:  '#fbbf24',
  math_reasoning: '#c084fc',
};

const TIER_COLOR: Record<ModelTier, string> = {
  cheap: 'var(--green)', balanced: 'var(--accent)', premium: 'var(--amber)',
};

const COMPLEXITY_LABELS: Record<TaskComplexity, string> = {
  low: 'low', medium: 'med', high: 'high',
};

function mono(s: string) {
  return <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s}</span>;
}

// ── Shared micro-badge ──────────────────────────────────────────────────────

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
      color, backgroundColor: bg,
      border: `1px solid ${color}33`,
      borderRadius: 4, padding: '1px 6px',
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  );
}

function TierChip({ tier }: { tier: ModelTier }) {
  const c = TIER_COLOR[tier];
  return <Chip label={tier} color={c} bg={`${c}14`} />;
}

function DomainChip({ domain }: { domain: TaskDomain }) {
  const c = DOMAIN_COLOR[domain];
  return <Chip label={domain} color={c} bg={`${c}14`} />;
}

// ── Pipeline strip ──────────────────────────────────────────────────────────

function PipelineStep({
  index, title, children, delay = 0,
}: {
  index: number; title: string; children: React.ReactNode; delay?: number;
}) {
  return (
    <div className="anim-fade-up" style={{
      animationDelay: `${delay}ms`,
      flex: 1, minWidth: 0,
      background: 'var(--surface-2)',
      border: '1px solid var(--rim)',
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          width: 16, height: 16, borderRadius: 4,
          background: 'var(--accent-bg)',
          border: '1px solid rgba(0,212,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--accent)', fontWeight: 600, flexShrink: 0,
        }}>
          {String(index).padStart(2, '0')}
        </span>
        <span style={{
          fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
      </div>
    </div>
  );
}

function PipelineRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
        color: accent ? 'var(--accent)' : '#e0e0e8',
        textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}

// ── Evaluated options table ─────────────────────────────────────────────────

function OptionRow({ opt, chosen }: { opt: EvaluatedOption; chosen: boolean }) {
  const maxScore = 3.0; // approximate upper bound for normalizing bar
  const barPct = Math.min(Math.max(opt.score / maxScore, 0), 1) * 100;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto 64px',
      alignItems: 'center',
      gap: 10,
      padding: '7px 12px',
      borderRadius: 6,
      background: chosen ? 'rgba(0,212,255,0.05)' : 'transparent',
      border: `1px solid ${chosen ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
    }}>
      {/* Model name + tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {chosen && (
          <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>▶</span>
        )}
        <span style={{
          fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
          color: chosen ? '#f0f0f0' : '#9ca3af',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {modelDisplayName(opt.modelId)}
        </span>
        <TierChip tier={opt.tier} />
      </div>
      {/* Conf */}
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', textAlign: 'right' }}>
        {(opt.averageConfidence * 100).toFixed(0)}%
      </span>
      {/* Latency */}
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', textAlign: 'right' }}>
        {Math.round(opt.averageLatencyMs)}ms
      </span>
      {/* Cost */}
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', textAlign: 'right' }}>
        ${opt.averageCostUsd.toFixed(5)}
      </span>
      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{
          flex: 1, height: 3, borderRadius: 2,
          background: 'var(--rim)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${barPct}%`, height: '100%', borderRadius: 2,
            background: chosen ? 'var(--accent)' : 'var(--muted)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{
          fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
          color: chosen ? 'var(--accent)' : 'var(--muted)',
          minWidth: 28, textAlign: 'right',
        }}>
          {opt.score.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ResponsePanel({ result, error, loading }: Props) {
  const [showOptions, setShowOptions] = useState(false);

  if (loading) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--rim)', borderRadius: 12,
        padding: '20px 20px 0',
      }}>
        {/* Skeleton pipeline */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton" style={{ flex: 1, height: 80, borderRadius: 8 }} />
          ))}
        </div>
        {/* Blinking cursor */}
        <div style={{
          padding: '20px 4px 28px',
          borderTop: '1px solid var(--rim)',
          fontSize: 13.5,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--muted)',
        }}>
          routing<span style={{ animation: 'blink 1s step-end infinite', display: 'inline-block', marginLeft: 2 }}>▋</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--rim)',
        borderLeft: '3px solid var(--red)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <p style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--red)', margin: '0 0 4px' }}>
          ERROR
        </p>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const { classification, initialModel, finalModel, escalated, strategyMode, evaluatedOptions, totalCostUsd, latencyMs } = result;
  const chosenModelId = initialModel.model;

  const strategyColor = strategyMode === 'exploitation' ? 'var(--green)'
    : strategyMode === 'exploration' ? 'var(--amber)'
    : 'var(--muted)';

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--rim)', borderRadius: 12, overflow: 'hidden' }}>

      {/* ── Pipeline trace ── */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--rim)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>

          {/* Step 1: Classify */}
          <PipelineStep index={1} title="Classify" delay={0}>
            <PipelineRow label="domain"  value={<DomainChip domain={classification.domain} />} />
            <PipelineRow label="complex" value={COMPLEXITY_LABELS[classification.complexity]} />
            <PipelineRow label="conf"    value={`${Math.round(classification.confidence * 100)}%`} accent={classification.confidence > 0.75} />
          </PipelineStep>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 12, flexShrink: 0, paddingTop: 24 }}>
            →
          </div>

          {/* Step 2: Route */}
          <PipelineStep index={2} title="Route" delay={60}>
            <PipelineRow label="provider" value={mono(initialModel.provider)} />
            <PipelineRow label="tier"     value={<TierChip tier={initialModel.tier} />} />
            <PipelineRow label="strategy" value={
              <span style={{ color: strategyColor, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
                {strategyMode}
              </span>
            } />
          </PipelineStep>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 12, flexShrink: 0, paddingTop: 24 }}>
            →
          </div>

          {/* Step 3: Execute */}
          <PipelineStep index={3} title="Execute" delay={120}>
            <PipelineRow label="model"   value={mono(finalModel.model)} />
            <PipelineRow label="latency" value={`${latencyMs}ms`} />
            <PipelineRow label="cost"    value={`$${totalCostUsd.toFixed(5)}`} accent />
          </PipelineStep>
        </div>

        {/* Escalation notice */}
        {escalated && (
          <div style={{
            marginTop: 10, padding: '5px 10px',
            background: 'var(--amber-bg)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, color: 'var(--amber)', fontFamily: "'IBM Plex Mono', monospace" }}>
              ↑ ESCALATED — initial model confidence below threshold, re-routed to {finalModel.provider}/{finalModel.tier}
            </span>
          </div>
        )}
      </div>

      {/* ── Response body ── */}
      <div style={{ padding: '20px 22px' }}>
        <div className="prose-router">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {result.response}
          </ReactMarkdown>
        </div>
      </div>

      {/* ── Evaluated options (collapsible) ── */}
      {evaluatedOptions.length > 0 && (
        <div style={{ borderTop: '1px solid var(--rim)' }}>
          <button
            type="button"
            onClick={() => setShowOptions(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 16px', fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              color: 'var(--muted)', letterSpacing: '0.07em',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <span>EVALUATED OPTIONS ({evaluatedOptions.length})</span>
            <span style={{ transition: 'transform 0.15s', display: 'inline-block', transform: showOptions ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>

          {showOptions && (
            <div style={{ borderTop: '1px solid var(--rim)' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto 64px',
                gap: 10, padding: '6px 12px',
                borderBottom: '1px solid var(--rim)',
              }}>
                {['provider/tier', 'conf', 'latency', 'cost', 'score'].map(h => (
                  <span key={h} style={{
                    fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                    color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
                    textAlign: h !== 'provider/tier' ? 'right' : 'left',
                  }}>{h}</span>
                ))}
              </div>
              <div style={{ padding: '4px 0' }}>
                {evaluatedOptions.map(opt => (
                  <OptionRow
                    key={opt.modelId}
                    opt={opt}
                    chosen={strategyMode === 'exploitation' && opt.modelId === chosenModelId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
