import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Admin client: service role, bypasses row-level security.
 *
 * Used only by the confirm gate (after the user's own confirmation),
 * plan-chat posting (after moderation) and scheduled jobs. Never hand it to
 * agent code: tests/gate.test.ts fails if anything under src/lib/agent can
 * reach this file.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
