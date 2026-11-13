import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { ConsentForm } from "@/components/auth/consent-form";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };

// Where Supabase sends people when an app (like Claude) asks to connect to
// their ProjectHub account. Set as the "Authorization Path" in Supabase →
// Authentication → OAuth Server. They must be fully signed in (password, and
// the two-step code if they use one) before they can say yes.
const CAN_DO = [
  "See the projects you can open, and their to-dos, meetings and notes",
  "Add and update to-dos and meetings",
  "Add notes, and add to your own notes",
  "Search everything you can see",
];
const CANNOT_DO = "It can't delete anything, change other people's notes, manage people or see projects you're not on.";

export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const q = await searchParams;
  const id = typeof q.authorization_id === "string" ? q.authorization_id : "";
  const back = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;

  // Two-step sign-in first, coming back here afterwards (the general check
  // in getCurrentUser would send them to the home page instead).
  const supabase = await createClient();
  const { data: c } = await supabase.auth.getClaims();
  if (!c?.claims?.sub) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (c.claims.aal !== "aal2") {
    const [{ data: u }, { data: profile }, { data: settings }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("role").eq("id", c.claims.sub).maybeSingle(),
      supabase.from("app_settings").select("require_mfa_for_all").maybeSingle(),
    ]);
    const has2fa = (u.user?.factors ?? []).some((f) => f.status === "verified");
    const required = profile?.role === "admin" || (settings?.require_mfa_for_all ?? false);
    if (has2fa || required) redirect(`/mfa?next=${encodeURIComponent(back)}`);
  }
  const user = await getCurrentUser();

  const problem = (title: string, text: string) => (
    <>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </>
  );
  if (!id) return problem("Connection request not complete", "Part of the address is missing. Start connecting again from the app.");

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return problem("This request has expired", "Connection requests only last a few minutes. Start connecting again from the app.");
  }
  // Already allowed before: go straight back to the app.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  let host = "";
  try {
    host = new URL(data.redirect_uri).host;
  } catch {
    host = data.redirect_uri;
  }
  const appName = data.client.name || "An app";

  return (
    <>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ShieldCheck className="size-5" />
      </div>
      <h1 className="text-xl font-semibold">Connect {appName} to ProjectHub?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {appName} will act as <span className="font-medium text-foreground">{user.fullName || user.username}</span>, with the
        same access you have.
      </p>

      <ul className="mt-5 space-y-2 text-sm">
        {CAN_DO.map((line) => (
          <li key={line} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--ok)" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{CANNOT_DO}</p>

      <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        After you choose, you&apos;ll go back to <span className="font-medium text-foreground">{host}</span>. You can
        disconnect at any time in Settings → Connected apps.
      </p>

      <ConsentForm authorizationId={data.authorization_id} />
    </>
  );
}
