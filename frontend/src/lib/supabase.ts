/**
 * supabase.ts
 *
 * Supabase client singleton for the frontend.
 * Uses the anon key — subject to Row Level Security policies.
 *
 * Required env vars (in .env or .env.local):
 *   VITE_SUPABASE_URL      — https://<project-ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY — public anon key from Settings → API
 */

import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);
