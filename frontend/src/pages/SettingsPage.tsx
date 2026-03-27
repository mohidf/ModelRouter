/**
 * SettingsPage.tsx
 *
 * Settings page — API key management section.
 * Loads existing keys (masked), allows adding/updating/deleting per provider.
 * All API calls include the user's Bearer token.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoredKeyInfo {
  provider:  string;
  maskedKey: string;
  updatedAt: string;
}

interface ProviderState {
  inputValue:  string;
  saving:      boolean;
  deleting:    boolean;
  error:       string | null;
  success:     string | null;
}

// ---------------------------------------------------------------------------
// Supported providers
// ---------------------------------------------------------------------------

const PROVIDERS: { id: string; label: string; placeholder: string }[] = [
  { id: 'openai',    label: 'OpenAI',     placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic',  placeholder: 'sk-ant-...' },
  { id: 'together',  label: 'Together AI', placeholder: 'Your Together API key' },
  { id: 'google',    label: 'Google',     placeholder: 'Your Google API key' },
  { id: 'cohere',    label: 'Cohere',     placeholder: 'Your Cohere API key' },
];

// ---------------------------------------------------------------------------
// Helper — get auth token
// ---------------------------------------------------------------------------

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.access_token;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { signOut } = useAuth();

  const [storedKeys,  setStoredKeys]  = useState<StoredKeyInfo[]>([]);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [provStates,  setProvStates]  = useState<Record<string, ProviderState>>(() =>
    Object.fromEntries(
      PROVIDERS.map(p => [p.id, { inputValue: '', saving: false, deleting: false, error: null, success: null }]),
    ),
  );

  // ── Load existing keys on mount ────────────────────────────────────────────

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoadError(null);
    try {
      const token = await getToken();
      const res   = await fetch(`${API_BASE}/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoadError('Failed to load keys.'); return; }
      const body = await res.json() as { keys: StoredKeyInfo[] };
      setStoredKeys(body.keys);
    } catch {
      setLoadError('Could not reach the server.');
    }
  }

  // ── Per-provider state helpers ─────────────────────────────────────────────

  function updateProv(id: string, patch: Partial<ProviderState>) {
    setProvStates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  function storedKey(provider: string): StoredKeyInfo | undefined {
    return storedKeys.find(k => k.provider === provider);
  }

  // ── Save key ──────────────────────────────────────────────────────────────

  async function handleSave(providerId: string) {
    const state = provStates[providerId];
    if (!state.inputValue.trim()) {
      updateProv(providerId, { error: 'Please enter an API key.' });
      return;
    }

    updateProv(providerId, { saving: true, error: null, success: null });

    try {
      const token = await getToken();
      const res   = await fetch(`${API_BASE}/keys`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ provider: providerId, apiKey: state.inputValue.trim() }),
      });

      const body = await res.json();
      if (!res.ok) {
        updateProv(providerId, { saving: false, error: (body as { error: string }).error ?? 'Save failed.' });
        return;
      }

      updateProv(providerId, { saving: false, success: 'Saved successfully.', inputValue: '' });
      await loadKeys();
    } catch {
      updateProv(providerId, { saving: false, error: 'Network error.' });
    }
  }

  // ── Delete key ────────────────────────────────────────────────────────────

  async function handleDelete(providerId: string) {
    updateProv(providerId, { deleting: true, error: null, success: null });

    try {
      const token = await getToken();
      const res   = await fetch(`${API_BASE}/keys/${providerId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await res.json();
      if (!res.ok) {
        updateProv(providerId, { deleting: false, error: (body as { error: string }).error ?? 'Delete failed.' });
        return;
      }

      updateProv(providerId, { deleting: false, success: 'Key removed.' });
      await loadKeys();
    } catch {
      updateProv(providerId, { deleting: false, error: 'Network error.' });
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background:   'var(--surface)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow:     'hidden',
  };

  const rowStyle: React.CSSProperties = {
    padding:     '20px 24px',
    borderBottom: '1px solid var(--border)',
  };

  const inputStyle: React.CSSProperties = {
    flex:         1,
    padding:      '8px 12px',
    background:   'var(--surface-2)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color:        'var(--text)',
    fontSize:     13.5,
    outline:      'none',
    fontFamily:   'JetBrains Mono, monospace',
  };

  const btnSmStyle = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
    padding:      '7px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize:     13,
    fontWeight:   500,
    cursor:       'pointer',
    border:       variant === 'ghost' ? '1px solid var(--border)' : 'none',
    background:   variant === 'primary' ? 'var(--accent)'
                : variant === 'danger'  ? 'var(--danger)'
                : 'var(--surface-2)',
    color:        variant === 'primary' ? 'var(--accent-on)'
                : variant === 'danger'  ? '#fff'
                : 'var(--text-2)',
    whiteSpace:   'nowrap',
  });

  return (
    <div style={{
      minHeight:  '100vh',
      background: 'var(--bg)',
      padding:    '40px 24px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <Link to="/" style={{ fontSize: 13, color: 'var(--text-2)', textDecoration: 'none' }}>
              ← Back to app
            </Link>
            <h1 style={{
              margin:        '8px 0 4px',
              fontSize:      22,
              fontWeight:    700,
              letterSpacing: '-0.03em',
              color:         'var(--text)',
            }}>
              Settings
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)' }}>
              Manage your API keys. Keys are stored securely and never shared.
            </p>
          </div>
          <button
            onClick={signOut}
            style={btnSmStyle('ghost')}
          >
            Sign out
          </button>
        </div>

        {/* API Keys section */}
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            API Keys
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>
            Add your own keys to use your personal quotas. Providers without a
            key will use the system keys automatically.
          </p>
        </div>

        {loadError && (
          <div style={{
            marginBottom: 16,
            padding:      '10px 14px',
            background:   'var(--danger-bg)',
            border:       '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color:        'var(--danger)',
            fontSize:     13,
          }}>
            {loadError}
          </div>
        )}

        <div style={cardStyle}>
          {PROVIDERS.map((prov, idx) => {
            const saved  = storedKey(prov.id);
            const state  = provStates[prov.id];
            const isLast = idx === PROVIDERS.length - 1;

            return (
              <div key={prov.id} style={{ ...rowStyle, ...(isLast ? { borderBottom: 'none' } : {}) }}>
                {/* Provider header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {prov.label}
                    </span>
                    {saved && (
                      <span style={{
                        fontSize:     11,
                        fontWeight:   500,
                        padding:      '2px 8px',
                        borderRadius: 99,
                        background:   'var(--success-bg)',
                        color:        'var(--success)',
                        border:       '1px solid var(--success)',
                      }}>
                        Saved
                      </span>
                    )}
                  </div>
                  {saved && (
                    <span style={{
                      fontSize:   13,
                      color:      'var(--muted)',
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      {saved.maskedKey}
                    </span>
                  )}
                </div>

                {/* Input row */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="password"
                    placeholder={saved ? 'Enter new key to replace…' : prov.placeholder}
                    value={state.inputValue}
                    onChange={e => updateProv(prov.id, { inputValue: e.target.value, error: null, success: null })}
                    style={inputStyle}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    onClick={() => handleSave(prov.id)}
                    disabled={state.saving}
                    style={btnSmStyle('primary')}
                  >
                    {state.saving ? 'Saving…' : 'Save'}
                  </button>
                  {saved && (
                    <button
                      onClick={() => handleDelete(prov.id)}
                      disabled={state.deleting}
                      style={btnSmStyle('danger')}
                    >
                      {state.deleting ? '…' : 'Remove'}
                    </button>
                  )}
                </div>

                {/* Feedback */}
                {state.error && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>
                    {state.error}
                  </p>
                )}
                {state.success && (
                  <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--success)' }}>
                    {state.success}
                  </p>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
