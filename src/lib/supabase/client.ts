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

// For saving notes: the same, but small saves are sent with "keepalive", so
// the browser still delivers them if the tab is closed or the phone switches
// apps straight after typing. (Browsers only allow this for requests up to
// 64 KB, so bigger saves go normally.)
export function createKeepaliveClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      isSingleton: false,
      global: {
        fetch: (input, init) => {
          const size = typeof init?.body === "string" ? init.body.length : Infinity;
          return fetch(input, size < 60_000 ? { ...init, keepalive: true } : init);
        },
      },
    },
  );
}
