import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function UpdatePasswordPage() {
  // Reached from a reset or invite link (which signs you in), or when an
  // admin requires a change. Either way you must be signed in.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");

  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;ll be signed out on your other devices.
      </p>
      <UpdatePasswordForm />
    </>
  );
}
