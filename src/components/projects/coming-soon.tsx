// Placeholder for project tabs that are built in later steps.
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <h2 className="font-medium">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
