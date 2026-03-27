/**
 * AuthGuard.tsx
 *
 * Wraps routes that require authentication.
 * Redirects to /login if no session is present.
 * Shows a spinner while the session is being resolved.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user)   return <Navigate to="/login" replace />;

  return <>{children}</>;
}
