// Supabase client for code that runs on the SERVER as the logged-in user
// (server components, server actions, route handlers). It reads the session
// from the request cookies, so the database's security rules apply.
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server components can't set cookies. That's fine: proxy.ts
            // refreshes the session on every request instead.
          }
        },
      },
    },
  );
}
