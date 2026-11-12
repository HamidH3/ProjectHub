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

// The address used in links that go out by email. Taken from SITE_URL, never
// from the request: someone could send a request with a fake "Host" header to
// get a real reset link pointing at their own site. While developing on your
// computer (npm run dev) it falls back to the request's address.
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return getRequestOrigin();
  throw new Error("SITE_URL is not set. Add it to the environment variables (e.g. https://your-domain).");
}
