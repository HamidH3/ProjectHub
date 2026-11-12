// Grey placeholder shapes shown the moment you tap a link, while the page's
// data loads. Used by the loading.tsx files: they make every tap change the
// screen straight away, and let Next.js fetch each page's frame ahead of time.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function Loading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={className}>
      {children}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// A whole page: Home, Calendar, People, Settings, or a project you're switching to.
export function PageSkeleton() {
  return (
    <Loading className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8">
      <Bar className="h-8 w-56" />
      <Bar className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} className="h-32" />
        ))}
      </div>
    </Loading>
  );
}

// The content under a project's tabs (the name and tabs stay on screen).
export function TabSkeleton() {
  return (
    <Loading>
      <div className="flex items-center justify-between gap-4">
        <Bar className="h-6 w-40" />
        <Bar className="h-9 w-28" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} className="h-12" />
        ))}
      </div>
    </Loading>
  );
}

// A note opening beside the notes list (the list stays on screen).
export function NoteSkeleton() {
  return (
    <Loading>
      <Bar className="h-9 w-2/3" />
      <div className="mt-6 space-y-3">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-11/12" />
        <Bar className="h-4 w-4/5" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-3/5" />
      </div>
    </Loading>
  );
}
