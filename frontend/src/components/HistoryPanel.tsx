import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { HistoryEntry, TaskDomain, ModelTier } from '../types';

interface Props { history: HistoryEntry[]; }

const DOMAIN_COLOR: Record<TaskDomain, string> = {
  coding: 'var(--d-coding)', math: 'var(--d-math)', creative: 'var(--d-creative)',
  general: 'var(--d-general)', research: 'var(--d-research)', summarization: 'var(--d-summ)',
  vision: 'var(--d-vision)', coding_debug: 'var(--d-debug)', general_chat: 'var(--d-chat)',
  multilingual: 'var(--d-multi)', math_reasoning: 'var(--d-reason)',
};
const TIER_COLOR: Record<ModelTier, string> = {
  cheap: 'var(--success)', balanced: 'var(--accent)', premium: 'var(--warning)',
};

function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 14 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="24" height="24" fill="none" stroke="var(--muted)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 260 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No history yet</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Run your first prompt and your routing history will appear here.
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: color ?? 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

export default function HistoryPanel({ history }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (history.length === 0) return <EmptyState />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Request History</h1>
          <p className="page-subtitle">Last {history.length} routing decisions</p>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--muted)', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px',
        }}>
          {history.length} / 10
        </span>
      </div>

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.map(entry => {
          const dc = DOMAIN_COLOR[entry.result.classification.domain];
          const tc = TIER_COLOR[entry.result.finalModel.tier];
          const expanded = expandedId === entry.id;

          return (
            <div key={entry.id} className="card">
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedId(prev => prev === entry.id ? null : entry.id)}
                aria-expanded={expanded}
                className="hover-bg-2"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', borderRadius: 'var(--radius-lg)',
                }}
              >
                {/* Domain dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: dc, boxShadow: `0 0 6px ${dc}80`,
                }} aria-hidden="true" />

                {/* Prompt text */}
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {entry.prompt}
                </span>

                {/* Right meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {entry.result.escalated && (
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--warning)', fontFamily: "'JetBrains Mono', monospace" }}>
                      ESCALATED
                    </span>
                  )}
                  <span style={{
                    fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
                    color: tc, background: `${tc}14`, border: `1px solid ${tc}28`,
                    borderRadius: 4, padding: '2px 7px',
                  }}>
                    {entry.result.finalModel.tier}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>
                    {entry.result.latencyMs}ms
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {fmtTime(entry.timestamp)}
                  </span>
                  <svg
                    width="14" height="14" fill="none" stroke="var(--muted)" strokeWidth="2.5" viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </button>

              {/* Expanded */}
              {expanded && (
                <div className="anim-fade-in" style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>

                    <div className="card-inner" style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                        <span className="label">Classification</span>
                      </div>
                      <InfoRow label="Domain"      value={entry.result.classification.domain}                      color={dc} />
                      <InfoRow label="Complexity"  value={entry.result.classification.complexity} />
                      <InfoRow label="Confidence"  value={`${Math.round(entry.result.classification.confidence * 100)}%`} />
                      <InfoRow label="Est. Tokens" value={String(entry.result.classification.estimatedTokens)} />
                    </div>

                    <div className="card-inner" style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                        <span className="label">Routing</span>
                      </div>
                      <InfoRow label="Initial"   value={`${entry.result.initialModel.provider}/${entry.result.initialModel.tier}`} />
                      <InfoRow label="Final"     value={`${entry.result.finalModel.provider}/${entry.result.finalModel.tier}`}   color={tc} />
                      <InfoRow label="Model"     value={entry.result.finalModel.model} />
                      <InfoRow label="Escalated" value={entry.result.escalated ? 'Yes' : 'No'} color={entry.result.escalated ? 'var(--warning)' : 'var(--muted)'} />
                      <InfoRow label="Latency"   value={`${entry.result.latencyMs}ms`} />
                      <InfoRow label="Cost"      value={`$${entry.result.totalCostUsd.toFixed(6)}`} />
                    </div>
                  </div>

                  {/* Response preview */}
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: '14px 16px',
                    maxHeight: 300, overflowY: 'auto',
                  }}>
                    <div className="prose-router" style={{ fontSize: 13 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {entry.result.response}
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
