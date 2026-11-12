import type { Metadata } from "next";
import Link from "next/link";
import { findInvite } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import { INVITE_PROBLEMS } from "@/lib/invite-code";
import { AcceptInviteForm } from "@/components/auth/continue-form";

export const metadata: Metadata = { title: "You're invited", robots: { index: false, follow: false } };

// Opening this page only LOOKS at the invite. Nothing is used until the
// person presses Continue (so email/chat link checkers can't use it up).
export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const found = await findInvite(code);

  if (found.state !== "ok") {
    return (
      <>
        <h1 className="text-xl font-semibold">{found.state === "used" ? "Invite already used" : "Can't open this invite"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{INVITE_PROBLEMS[found.state]}</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          Go to sign in
        </Link>
      </>
    );
  }

  // Someone else already signed in on this browser (e.g. the admin testing the link)?
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedInAs = typeof data?.claims?.email === "string" ? data.claims.email : null;

  return (
    <>
      <h1 className="text-xl font-semibold">You&apos;re invited to ProjectHub</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {found.inviterName ? `${found.inviterName} invited` : "You've been invited"} {found.fullName ? found.fullName : "you"} (
        <span className="text-foreground">{found.email}</span>). Next you&apos;ll choose a username and password.
      </p>
      {signedInAs && signedInAs !== found.email && (
        <p className="mt-3 rounded-md bg-[#e5b94e]/10 px-3 py-2 text-sm">
          This browser is signed in as {signedInAs}. Continuing signs that account out here and sets up {found.email}.
        </p>
      )}
      <AcceptInviteForm code={code} />
    </>
  );
}
