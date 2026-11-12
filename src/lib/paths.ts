// Only allow redirects to pages on this site (e.g. "/projects/123"),
// never to another website ("//evil.com" or "https://evil.com").
// Browsers quietly drop tabs and line breaks from addresses and treat "\" as
// "/", so "/\t/evil.com" or "/\evil.com" would also lead to another site:
// anything containing those is refused too.
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}
