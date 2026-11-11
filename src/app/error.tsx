"use client";

// Shown if something goes wrong while loading a page.
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
