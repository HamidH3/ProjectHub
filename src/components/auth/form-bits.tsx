"use client";

// Small shared pieces for the login screens.
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        {success}
      </p>
    );
  }
  return null;
}

export function Field({
  label,
  hint,
  ...inputProps
}: React.ComponentProps<typeof Input> & { label: string; hint?: string; name: string }) {
  const id = inputProps.id ?? inputProps.name;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...inputProps} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
