/**
 * OnboardingPage.tsx
 *
 * Shown once after a user's first sign-in.
 * Clears the new-user flag and routes to settings (API keys) or the app.
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconBolt() {
  return (
    <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function OnboardingPage() {
  const navigate = useNavigate();
  const { clearNewUser } = useAuth();

  function finish(destination: '/settings' | '/') {
    clearNewUser();
    navigate(destination, { replace: true });
  }

  const btnBaseStyle: React.CSSProperties = {
    padding:      '11px 24px',
    borderRadius: 'var(--radius-sm)',
    fontSize:     14,
    fontWeight:   500,
    cursor:       'pointer',
    border:       'none',
  };

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '100vh',
      background:     'var(--bg)',
      padding:        24,
    }}>
      <div style={{
        background:   'var(--surface)',
        border:       '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding:      '48px 40px',
        maxWidth:     440,
        width:        '100%',
        textAlign:    'center',
        boxShadow:    'var(--shadow-md)',
      }}>
        {/* Logo */}
        <div style={{
          width:        56,
          height:       56,
          borderRadius: 'var(--radius-md)',
          background:   'var(--surface-3)',
          border:       '1px solid var(--border-hi)',
          display:      'inline-flex',
          alignItems:   'center',
          justifyContent: 'center',
          color:        'var(--text)',
          marginBottom: 24,
        }}>
          <IconBolt />
        </div>

        <h1 style={{
          margin:        '0 0 12px',
          fontSize:      24,
          fontWeight:    700,
          letterSpacing: '-0.03em',
          color:         'var(--text)',
        }}>
          Welcome to ModelRouter
        </h1>

        <p style={{
          margin:     '0 0 12px',
          fontSize:   14.5,
          color:      'var(--text-2)',
          lineHeight: 1.6,
        }}>
          Your account is ready. ModelRouter will route your prompts to the
          best available model automatically.
        </p>

        <p style={{
          margin:     '0 0 36px',
          fontSize:   14,
          color:      'var(--muted)',
          lineHeight: 1.6,
        }}>
          You can add your own API keys now to use your personal rate limits
          and billing, or skip and add them later in Settings.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => finish('/settings')}
            style={{
              ...btnBaseStyle,
              background: 'var(--accent)',
              color:      'var(--accent-on)',
            }}
          >
            Add API Keys →
          </button>

          <button
            onClick={() => finish('/')}
            style={{
              ...btnBaseStyle,
              background: 'var(--surface-2)',
              color:      'var(--text-2)',
              border:     '1px solid var(--border)',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
