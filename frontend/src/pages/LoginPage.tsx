/**
 * LoginPage.tsx
 *
 * Two-panel authentication page (Vercel/Linear aesthetic).
 * Left panel: hero with feature bullets.
 * Right panel: email/password form. On invalid credentials, prompts sign-up.
 */

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconBolt() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Feature bullets for hero panel
// ---------------------------------------------------------------------------

const FEATURES = [
  { text: 'Routes prompts to the optimal LLM automatically' },
  { text: 'Balances cost, quality, and latency per task type' },
  { text: 'Supports OpenAI, Anthropic, and Together AI' },
  { text: 'Use your own API keys for full cost control' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function LoginPage() {
  const { user } = useAuth();
  const [mode,            setMode]            = useState<'signin' | 'signup'>('signin');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [error,           setError]           = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [notRegistered,   setNotRegistered]   = useState(false);

  if (user) return <Navigate to="/" replace />;

  function switchToSignUp() {
    setMode('signup');
    setError(null);
    setNotRegistered(false);
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError(null);
    setNotRegistered(false);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) { setError(err.message); return; }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          // Supabase returns "Invalid login credentials" for both wrong password
          // and non-existent account. Prompt the user to sign up.
          const isNotFound =
            err.message.toLowerCase().includes('invalid login credentials') ||
            err.message.toLowerCase().includes('user not found') ||
            err.message.toLowerCase().includes('no user found');

          if (isNotFound) {
            setNotRegistered(true);
          } else {
            setError(err.message);
          }
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background:   'var(--surface)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding:      '36px 32px',
    width:        '100%',
    maxWidth:     400,
    boxShadow:    'var(--shadow-md)',
  };

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '9px 12px',
    background:   'var(--surface-2)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color:        'var(--text)',
    fontSize:     14,
    outline:      'none',
    boxSizing:    'border-box',
  };

  const btnPrimaryStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '10px 16px',
    background:   'var(--accent)',
    color:        'var(--accent-on)',
    border:       'none',
    borderRadius: 'var(--radius-sm)',
    fontSize:     14,
    fontWeight:   500,
    cursor:       loading ? 'not-allowed' : 'pointer',
    opacity:      loading ? 0.7 : 1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize:     13,
    fontWeight:   500,
    color:        'var(--text-2)',
    marginBottom: 5,
    display:      'block',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ── Left hero panel ── */}
      <div
        className="login-hero"
        style={{
          flex:           1,
          display:        'flex',
          flexDirection:  'column',
          justifyContent: 'center',
          padding:        '60px 56px',
          borderRight:    '1px solid var(--border)',
          background:     'var(--sidebar-bg)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{
            width:          36,
            height:         36,
            borderRadius:   10,
            background:     'var(--surface-3)',
            border:         '1px solid var(--border-hi)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            color:          'var(--text)',
          }}>
            <IconBolt />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>
            ModelRouter
          </span>
        </div>

        <h1 style={{
          fontSize:      32,
          fontWeight:    700,
          letterSpacing: '-0.04em',
          color:         'var(--text)',
          margin:        '0 0 14px',
          lineHeight:    1.2,
        }}>
          Intelligent<br />LLM Routing
        </h1>

        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 36px' }}>
          Route every prompt to the optimal model based on task type,
          complexity, and cost — automatically.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FEATURES.map((f) => (
            <li key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, flexShrink: 0, marginTop: 1 }}>→</span>
              <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right auth panel ── */}
      <div style={{
        flex:           1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '40px 32px',
      }}>
        <div style={cardStyle}>
          <h2 style={{
            margin:        '0 0 4px',
            fontSize:      20,
            fontWeight:    600,
            letterSpacing: '-0.03em',
            color:         'var(--text)',
          }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: 13.5, color: 'var(--text-2)' }}>
            {mode === 'signin'
              ? 'Welcome back. Sign in to continue.'
              : 'Create a free account to get started.'}
          </p>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle} htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={inputStyle}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 8 : undefined}
              />
            </div>

            {/* Generic error */}
            {error && (
              <div style={{
                padding:      '9px 12px',
                background:   'var(--danger-bg)',
                border:       '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                color:        'var(--danger)',
                fontSize:     13,
              }}>
                {error}
              </div>
            )}

            {/* Not-registered prompt */}
            {notRegistered && (
              <div style={{
                padding:      '12px 14px',
                background:   'var(--surface-2)',
                border:       '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize:     13,
                color:        'var(--text-2)',
                lineHeight:   1.5,
              }}>
                No account found for that email.{' '}
                <button
                  type="button"
                  onClick={switchToSignUp}
                  style={{
                    background: 'none',
                    border:     'none',
                    color:      'var(--accent)',
                    cursor:     'pointer',
                    fontSize:   13,
                    fontWeight: 500,
                    padding:    0,
                  }}
                >
                  Create an account
                </button>
              </div>
            )}

            <button type="submit" style={btnPrimaryStyle} disabled={loading}>
              {loading
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </button>
          </form>

          {/* Toggle mode */}
          <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotRegistered(false); }}
              style={{
                background: 'none',
                border:     'none',
                color:      'var(--accent)',
                cursor:     'pointer',
                fontSize:   13,
                fontWeight: 500,
                padding:    0,
              }}
            >
              {mode === 'signin' ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      {/* Responsive: hide hero on small screens */}
      <style>{`
        @media (max-width: 680px) {
          .login-hero { display: none !important; }
        }
      `}</style>
    </div>
  );
}
