import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitResult = "allowed" | "limited" | "unavailable";

/**
 * Counts one attempt for `key` and says whether it is within `limit`
 * attempts per `windowSeconds`. Uses the database function
 * public.hit_rate_limit (migration 2), which only the secret key can call.
 * If the check itself fails, the caller should refuse the attempt.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("hit_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    return data === true ? "allowed" : "limited";
  } catch (err) {
    console.error("Rate limit check failed:", err instanceof Error ? err.message : err);
    return "unavailable";
  }
}

export const UNAVAILABLE_MESSAGE = "Can't reach the server right now. Try again in a minute.";
