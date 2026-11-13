"use server";

// "Allow" / "Don't allow" on the page where someone connects Claude (or
// another app) to their ProjectHub account, and "Disconnect" in Settings.
// Supabase's OAuth server does the actual work; these run as the signed-in
// person (their own session), never with the secret key.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

type State = { error?: string } | undefined;

const ID = /^[A-Za-z0-9_-]{8,200}$/;

export async function decideConnection(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("authorization_id") ?? "");
  const allow = formData.get("decision") === "allow";
  if (!ID.test(id)) return { error: "This connection request isn't valid. Start connecting again from Claude." };

  await getCurrentUser(); // fully signed in, including two-step sign-in
  const supabase = await createClient();
  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    return { error: "This connection request has expired or was already used. Start connecting again from Claude." };
  }
  // Supabase builds this address from the app's registered return address.
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(data.redirect_url)) {
    return { error: "That app's return address isn't secure, so the connection was stopped." };
  }
  redirect(data.redirect_url);
}

export async function disconnectApp(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  if (!ID.test(clientId)) return;
  await getCurrentUser();
  const supabase = await createClient();
  await supabase.auth.oauth.revokeGrant({ clientId });
  revalidatePath("/settings");
}
