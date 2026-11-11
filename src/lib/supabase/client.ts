// Supabase client for code that runs in the BROWSER (client components).
// Uses only the publishable key; the logged-in user's session is kept in
// cookies, and every query is checked by the database's security rules.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
