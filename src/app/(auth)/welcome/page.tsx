import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "@/components/auth/welcome-form";

export const metadata: Metadata = { title: "Welcome" };

// Reached from an invite email's link, which signs you in. Here you choose
// your name, username and password before using ProjectHub.
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login?error=link");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, username, must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (profile && profile.username && !profile.must_change_password) redirect("/");

  return (
    <>
      <h1 className="text-xl font-semibold">Welcome to ProjectHub</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Set up your account. You&apos;ll sign in with your username or email and this password.
      </p>
      <WelcomeForm fullName={profile?.full_name ?? ""} email={typeof data?.claims?.email === "string" ? data.claims.email : ""} />
    </>
  );
}
