import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/paths";
import { ContinueLinkForm } from "@/components/auth/continue-form";

export const metadata: Metadata = { title: "Continue", robots: { index: false, follow: false } };

// Where password reset links land. Opening it only shows a button; pressing
// it uses the link (so email/chat link checkers can't use it up first).
export default async function ContinuePage({ searchParams }: PageProps<"/continue">) {
  const q = await searchParams;
  const tokenHash = typeof q.token_hash === "string" ? q.token_hash : null;
  const type = typeof q.type === "string" ? q.type : null;
  const reset = type === "recovery";
  const next = safeNextPath(q.next, reset ? "/update-password" : "/");

  if (!tokenHash || !type) {
    return (
      <>
        <h1 className="text-xl font-semibold">Link not complete</h1>
        <p className="mt-2 text-sm text-muted-foreground">Part of the link seems to be missing. Copy the whole link from the email, or request a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-block text-sm text-primary hover:underline">
          Request a new password reset link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">{reset ? "Reset your password" : "Continue to ProjectHub"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {reset ? "Press the button to choose a new password." : "Press the button to continue."}
      </p>
      <ContinueLinkForm tokenHash={tokenHash} type={type} next={next} label={reset ? "Choose a new password" : "Continue"} />
    </>
  );
}
