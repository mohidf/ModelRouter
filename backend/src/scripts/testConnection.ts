/**
 * testConnection.ts
 * Run with: npm run test:db
 * Verifies the Supabase connection and that the expected tables exist.
 */

import 'dotenv/config';
import { getSupabaseClient } from '../lib/supabase';

async function main(): Promise<void> {
  const sb = getSupabaseClient();
  console.log('Connecting to Supabase…');

  // Check performance_stats
  const { error: e1, count: c1 } = await sb
    .from('performance_stats')
    .select('*', { count: 'exact', head: true });

  if (e1) {
    console.error('✗ performance_stats:', e1.message);
    process.exit(1);
  }
  console.log(`✓ performance_stats  (${c1 ?? 0} rows)`);

  // Check request_logs
  const { error: e2, count: c2 } = await sb
    .from('request_logs')
    .select('*', { count: 'exact', head: true });

  if (e2) {
    console.error('✗ request_logs:', e2.message);
    console.error('  → Run migration 002_request_logs.sql in the Supabase SQL editor first.');
    process.exit(1);
  }
  console.log(`✓ request_logs       (${c2 ?? 0} rows)`);

  console.log('\nAll checks passed.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
