import type { Metadata } from "next";
import { Suspense } from "react";
import { MfaForm } from "@/components/auth/mfa-form";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default function MfaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <MfaForm />
    </Suspense>
  );
}
