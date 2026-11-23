// Links that look like buttons (Join, Open in Outlook, Sign in with Microsoft).
// Plain classes, so they don't depend on the UI kit's Button supporting links.
export const linkButton = {
  primary:
    "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90",
  small:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90",
  outline:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition hover:bg-accent",
};
