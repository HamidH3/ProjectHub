"use server";

// "Allow" / "Don't allow" on the page where someone connects Claude (or
// another app) to their ProjectHub account, and "Disconnect" in Settings.
// Supabase's OAuth server does the actual work; these run as the signed-in
// person (their own session), never with the secret key.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type State = { error?: string } | undefined;

const ID = /^[A-Za-z0-9_-]{8,200}$/;

export async function decideConnection(_prev: State, formData: FormData): Promise<State> {
  const id = String(formData.get("authorization_id") ?? "");
  const allow = formData.get("decision") === "allow";
  if (!ID.test(id)) return { error: "This connection request isn't valid. Start connecting again from Claude." };

  const user = await getCurrentUser(); // fully signed in, including two-step sign-in
  const supabase = await createClient();

  // Which app is asking (so older connections from the same app can be removed).
  const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(id);
  const asking = details && "authorization_id" in details ? details.client : null;

  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    return { error: "This connection request has expired or was already used. Start connecting again from Claude." };
  }
  // Claude registers itself afresh each time it connects, so reconnecting
  // would leave an old, dead "Claude" behind. Keep only this newest one.
  if (allow && asking) {
    await removeOlderConnections(supabase, user.id, asking.id, asking.name);
    // Tokens Supabase gives apps never show that the two-step code was
    // entered, so the database would hide everything from them for people
    // with 2FA. Record that this person approved THIS app with their code
    // entered (migration 15). Only the server can write this record.
    const { data: c } = await supabase.auth.getClaims();
    if (c?.claims?.aal === "aal2") {
      const { error: recErr } = await createAdminClient().rpc("record_connector_approval", {
        p_user_id: user.id,
        p_client_id: asking.id,
      });
      if (recErr) console.error("Couldn't record connector approval:", recErr.message);
    }
  }

  // Supabase builds this address from the app's registered return address.
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(data.redirect_url)) {
    return { error: "That app's return address isn't secure, so the connection was stopped." };
  }
  redirect(data.redirect_url);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

const sameApp = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function forgetApprovals(userId: string, clientIds: string[]) {
  if (clientIds.length === 0) return;
  const { error } = await createAdminClient().rpc("forget_connector_approvals", { p_user_id: userId, p_client_ids: clientIds });
  if (error) console.error("Couldn't remove connector approvals:", error.message);
}

async function removeOlderConnections(supabase: Supabase, userId: string, keepClientId: string, name: string) {
  const { data: grants } = await supabase.auth.oauth.listGrants();
  const older = (grants ?? []).filter((g) => g.client.id !== keepClientId && sameApp(g.client.name || "", name || ""));
  await Promise.all(older.map((g) => supabase.auth.oauth.revokeGrant({ clientId: g.client.id })));
  await forgetApprovals(userId, older.map((g) => g.client.id));
}

// Disconnect in Settings: removes every connection for that app (Settings
// shows each app once, even if it connected more than once).
export async function disconnectApp(formData: FormData) {
  const name = String(formData.get("app_name") ?? "");
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: grants } = await supabase.auth.oauth.listGrants();
  const mine = (grants ?? []).filter((g) => sameApp(g.client.name || "An app", name));
  await Promise.all(mine.map((g) => supabase.auth.oauth.revokeGrant({ clientId: g.client.id })));
  await forgetApprovals(user.id, mine.map((g) => g.client.id));
  revalidatePath("/settings");
}
