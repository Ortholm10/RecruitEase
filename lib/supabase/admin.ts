import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Only for paths RLS cannot cover (audit_log has no
 * insert policy by design, and the candidate-facing interview room writes
 * turns/events for a session-less browser after a code-level email gate).
 * NEVER ship this key to the client bundle — server-only.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}