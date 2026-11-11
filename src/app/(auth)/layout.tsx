// Shared frame for the login screens: the app name and a centred panel.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span aria-hidden className="size-7 rounded-lg bg-primary" />
        <span className="text-lg font-semibold tracking-tight">ProjectHub</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 shadow-sm">
        {children}
      </div>
    </main>
  );
}
