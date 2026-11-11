// Supabase client with the SECRET key. It skips every security rule, so:
//   * it can only be imported by server code ("server-only" makes the build
//     fail if browser code tries), and
//   * every caller must check permissions itself before using it.
// Used only for: first-time setup, username lookup at login, rate limiting,
// audit logs, invitations and removing users.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Check .env.local.",
    );
  }

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
