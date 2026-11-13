import "server-only";

// Settings → Connected apps: apps (like Claude) you've allowed into your
// ProjectHub account, with a Disconnect button, and how to connect Claude.
import { headers } from "next/headers";
import { Plug } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { disconnectApp } from "@/actions/oauth";
import { Button } from "@/components/ui/button";

export async function ConnectedApps() {
  const supabase = await createClient();
  const { data: grants, error } = await supabase.auth.oauth.listGrants();
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/+$/, "") ?? `https://${h.get("host") ?? "your-site"}`;

  return (
    <div className="space-y-4 p-5">
      {error ? (
        <p className="text-sm text-muted-foreground">Connected apps aren&apos;t switched on for this site yet.</p>
      ) : grants && grants.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {grants.map((g) => (
            <li key={g.client.id} className="flex items-center gap-3 px-4 py-3">
              <Plug className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.client.name || "An app"}</p>
                <p className="text-xs text-muted-foreground">
                  Connected {new Date(g.granted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <form action={disconnectApp}>
                <input type="hidden" name="client_id" value={g.client.id} />
                <Button type="submit" variant="outline" size="sm">
                  Disconnect
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No apps connected.</p>
      )}

      <div className="rounded-lg bg-muted px-4 py-3 text-sm">
        <p className="font-medium">Use ProjectHub from Claude</p>
        <p className="mt-1 text-muted-foreground">
          In Claude, open Settings → Connectors → Add custom connector, name it ProjectHub, and use this address:
        </p>
        <code className="mt-2 block rounded bg-background px-2 py-1.5 font-mono text-xs [overflow-wrap:anywhere]">{site}/mcp</code>
        <p className="mt-2 text-xs text-muted-foreground">
          You&apos;ll sign in to ProjectHub and press Allow. Claude then works as you, seeing only what you can see.
        </p>
      </div>
    </div>
  );
}
