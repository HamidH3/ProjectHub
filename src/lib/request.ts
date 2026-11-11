import "server-only";
import { headers } from "next/headers";

// The visitor's IP address, used as the key for rate limits.
// On Vercel, x-forwarded-for is set by Vercel itself and can be trusted.
export async function getRequestIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

// This site's own address (e.g. http://localhost:3000 or https://your-domain),
// taken from the incoming request. Used for links in emails.
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
