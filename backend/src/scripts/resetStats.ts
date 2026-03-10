/**
 * resetStats.ts
 * Run with: npm run reset:stats
 *
 * Clears all rows from performance_stats and request_logs so the strategy
 * engine starts from a clean slate. Use before benchmarks when routing
 * weights or tier mappings have changed and stale EMA data would bias results.
 */

import 'dotenv/config';
import { getSupabaseClient } from '../lib/supabase';

async function main(): Promise<void> {
  const sb = getSupabaseClient();

  // Delete all performance stats (strategy engine will rebuild via EMA)
  // neq('provider', '') matches every row since provider is always a non-empty string.
  const { error: e1 } = await sb
    .from('performance_stats')
    .delete()
    .neq('provider', '');

  if (e1) {
    console.error('✗ Failed to clear performance_stats:', e1.message);
    process.exit(1);
  }
  console.log('✓ Cleared performance_stats');

  // Delete all request logs
  const { error: e2 } = await sb
    .from('request_logs')
    .delete()
    .neq('provider', '');

  if (e2) {
    console.error('✗ Failed to clear request_logs:', e2.message);
    process.exit(1);
  }
  console.log('✓ Cleared request_logs');

  console.log('\nStats reset complete. Run npm run dev then npm run benchmark.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
