// Checks that a webhook really came from Recall.ai (the "Standard Webhooks"
// scheme Recall uses): an HMAC-SHA256 of "<id>.<timestamp>.<body>" made with
// your workspace verification secret (whsec_…). Anyone can call the webhook
// address, so nothing in a request is believed until this passes.
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 5 * 60; // also stops an old request being replayed later

export function verifyRecallSignature(
  secret: string | undefined,
  headers: Headers,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !secret.startsWith("whsec_")) return false;
  // Newer Recall accounts send webhook-*; older ones send svix-* (same scheme).
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestamp = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const signatures = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  // The header can hold several signatures ("v1,abc v1,def") while a secret is
  // being rotated; any one of them matching is enough.
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// For tests: makes a valid signature header.
export function signForTest(secret: string, id: string, timestamp: number, rawBody: string): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
}
