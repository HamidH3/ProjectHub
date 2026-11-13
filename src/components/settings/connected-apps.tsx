import "server-only";

// Settings → Connected apps: apps (like Claude) you've allowed into your
// ProjectHub account, with a Disconnect button, and how to connect Claude.
import { headers } from "next/headers";
import { Plug } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { disconnectApp } from "@/actions/oauth";
import { Button } from "@/components/ui/button";

export async function ConnectedApps() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  const { data: grants, error } = await supabase.auth.oauth.listGrants();
  // One row per app (an app that connected more than once is shown once,
  // with its latest connection).
  const apps = new Map<string, { name: string; since: string }>();
  for (const g of grants ?? []) {
    const name = g.client.name || "An app";
    const key = name.trim().toLowerCase();
    const seen = apps.get(key);
    if (!seen || g.granted_at > seen.since) apps.set(key, { name, since: g.granted_at });
  }
  const h = await headers();
  const site = process.env.SITE_URL?.replace(/\/+$/, "") ?? `https://${h.get("host") ?? "your-site"}`;

  return (
    <div className="space-y-4 p-5">
      {error ? (
        <p className="text-sm text-muted-foreground">Connected apps aren&apos;t switched on for this site yet.</p>
      ) : apps.size > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {[...apps.values()].map((g) => (
            <li key={g.name} className="flex items-center gap-3 px-4 py-3">
              <Plug className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  Connected{" "}
                  {new Date(g.since).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: user.timezone,
                  })}
                </p>
              </div>
              <form action={disconnectApp}>
                <input type="hidden" name="app_name" value={g.name} />
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
