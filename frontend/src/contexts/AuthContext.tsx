/**
 * AuthContext.tsx
 *
 * Provides authentication state and actions to the entire app.
 *
 * Exposes:
 *   user       — Supabase User object or null when not authenticated
 *   loading    — true while the initial session is being resolved
 *   isNewUser  — true if this is the user's first sign-in (for onboarding)
 *   signOut()  — signs out and clears session
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user:         User | null;
  loading:      boolean;
  isNewUser:    boolean;
  signOut:      () => Promise<void>;
  clearNewUser: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    // Resolve the current session on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Subscribe to auth state changes (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN') {
          // Mark as new user only on first sign-in (localStorage flag).
          const alreadyOnboarded = localStorage.getItem('mr_onboarded') === 'true';
          if (!alreadyOnboarded) {
            localStorage.setItem('mr_is_new_user', 'true');
            setIsNewUser(true);
          }
        }

        if (event === 'SIGNED_OUT') {
          setIsNewUser(false);
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Restore isNewUser flag from localStorage on mount.
  useEffect(() => {
    if (localStorage.getItem('mr_is_new_user') === 'true') {
      setIsNewUser(true);
    }
  }, []);

  function clearNewUser(): void {
    localStorage.removeItem('mr_is_new_user');
    localStorage.setItem('mr_onboarded', 'true');
    setIsNewUser(false);
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, loading, isNewUser, clearNewUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
