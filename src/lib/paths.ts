// Only allow redirects to pages on this site (e.g. "/projects/123"),
// never to another website ("//evil.com" or "https://evil.com").
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
