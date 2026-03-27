/**
 * userKeyService.ts
 *
 * Fetches user-supplied API keys from the user_api_keys table.
 * Uses the service-role Supabase client so queries bypass RLS —
 * the userId filter is applied explicitly to scope to the calling user.
 *
 * Keys are returned as a provider→apiKey map.
 * Callers should pass the map into providers so they fall back to env vars
 * when a user has not supplied a key for a given provider.
 */

import { getSupabaseClient } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map of provider name → API key for a single user. */
export type UserApiKeyMap = Record<string, string>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Fetch all API keys stored for the given user.
 * Returns an empty map if the user has no keys or a DB error occurs.
 * Errors are silently absorbed — a missing key causes graceful fallback
 * to the system environment key rather than a hard failure.
 */
export async function getUserApiKeys(userId: string): Promise<UserApiKeyMap> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('provider, api_key')
    .eq('user_id', userId);

  if (error || !data) return {};

  const map: UserApiKeyMap = {};
  for (const row of data) {
    map[row.provider as string] = row.api_key as string;
  }
  return map;
}
