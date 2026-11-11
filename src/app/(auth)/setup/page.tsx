import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetupForm } from "@/components/auth/setup-form";

export const metadata: Metadata = { title: "First-time setup" };

export default async function SetupPage() {
  await connection(); // check the database on every visit, never at build time

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (error || count === null) {
    return (
      <>
        <h1 className="text-xl font-semibold">Can&apos;t reach the database</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check the Supabase values in <code>.env.local</code>, then reload this page.
        </p>
      </>
    );
  }

  if ((count ?? 0) > 0) {
    return (
      <>
        <h1 className="text-xl font-semibold">Setup is complete</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An administrator already exists, so this page is switched off.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Create the admin account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This page works once. It needs the <code>SETUP_TOKEN</code> from your server settings.
      </p>
      <SetupForm />
    </>
  );
}
