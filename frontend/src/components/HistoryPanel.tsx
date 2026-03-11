import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { HistoryEntry, TaskDomain, ModelTier } from '../types';

interface Props { history: HistoryEntry[]; }

const DOMAIN_COLOR: Record<TaskDomain, string> = {
  coding: '#00d4ff', math: '#a78bfa', creative: '#f472b6', general: '#34d399',
};

const TIER_COLOR: Record<ModelTier, string> = {
  cheap: '#00ff88', balanced: '#00d4ff', premium: '#f59e0b',
};

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HistoryPanel({ history }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (history.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 240, gap: 10,
      }}>
        <span style={{ fontSize: 28, opacity: 0.15 }}>⏱</span>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No requests yet</p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>Run some prompts and they'll appear here</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: '#f0f0f0' }}>
          Recent Requests
        </h2>
        <span style={{
          fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
          color: 'var(--muted)', background: 'var(--surface)',
          border: '1px solid var(--rim)', borderRadius: 6, padding: '2px 8px',
        }}>
          {history.length} / 10
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.map((entry) => {
          const { result } = entry;
          const isExpanded = expandedId === entry.id;
          const dc = DOMAIN_COLOR[result.classification.domain];
          const tc = TIER_COLOR[result.finalModel.tier];

          return (
            <div key={entry.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--rim)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              {/* ── Collapsed row ── */}
              <button
                onClick={() => setExpandedId(prev => prev === entry.id ? null : entry.id)}
                style={{
                  width: '100%', display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                {/* Domain dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  backgroundColor: dc, flexShrink: 0,
                  boxShadow: `0 0 6px ${dc}80`,
                }} />

                {/* Prompt preview */}
                <span style={{
                  fontSize: 12.5, color: '#c8c8d0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {entry.prompt}
                </span>

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {result.escalated && (
                    <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--amber)' }}>↑ esc</span>
                  )}
                  <span style={{
                    fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                    color: tc, background: `${tc}14`,
                    border: `1px solid ${tc}33`,
                    borderRadius: 4, padding: '1px 6px',
                  }}>
                    {result.finalModel.tier}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>
                    {result.latencyMs}ms
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)' }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <span style={{
                    fontSize: 10, color: 'var(--muted)',
                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                    display: 'inline-block', transition: 'transform 0.15s',
                  }}>▾</span>
                </div>
              </button>

              {/* ── Expanded ── */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--rim)', padding: '16px 16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {/* Classification */}
                    <Section title="Classification">
                      <Row label="domain"     value={result.classification.domain}    color={dc} />
                      <Row label="complexity" value={result.classification.complexity} />
                      <Row label="confidence" value={`${Math.round(result.classification.confidence * 100)}%`} />
                      <Row label="est. tokens" value={String(result.classification.estimatedTokens)} />
                    </Section>

                    {/* Routing */}
                    <Section title="Routing">
                      <Row label="initial"   value={`${result.initialModel.provider}/${result.initialModel.tier}`} />
                      <Row label="final"     value={`${result.finalModel.provider}/${result.finalModel.tier}`} color={tc} />
                      <Row label="model"     value={result.finalModel.model} mono />
                      <Row label="escalated" value={result.escalated ? 'yes' : 'no'} color={result.escalated ? 'var(--amber)' : 'var(--muted)'} />
                      <Row label="latency"   value={`${result.latencyMs}ms`} />
                      <Row label="cost"      value={`$${result.totalCostUsd.toFixed(6)}`} />
                    </Section>
                  </div>

                  {/* Response */}
                  <div style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--rim)',
                    borderRadius: 8, padding: '14px 16px',
                    maxHeight: 320, overflowY: 'auto',
                  }}>
                    <div className="prose-router" style={{ fontSize: 13 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {result.response}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        margin: '0 0 8px', fontSize: 9,
        fontFamily: "'IBM Plex Mono', monospace",
        color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>{title}</p>
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--rim)', borderRadius: 8,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color, mono: isMono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '5px 10px',
      borderBottom: '1px solid var(--rim)',
    }}>
      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--muted)', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: 10.5,
        fontFamily: isMono ? "'IBM Plex Mono', monospace" : "'DM Sans', system-ui, sans-serif",
        color: color ?? '#c8c8d0',
        textAlign: 'right', maxWidth: '60%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}
