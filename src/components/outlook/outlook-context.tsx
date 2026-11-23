"use client";

// Your Outlook events on a page (Calendar, a project's calendar, Home). Only
// you see them. The page shows the copy ProjectHub already has straight away,
// then quietly asks for a refresh if it's more than a few minutes old.
// Clicking an event opens a small window with its details, a "Join" button,
// and a choice of project to link it to.
import { createContext, use, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CalendarDays, ExternalLink, Loader2, MapPin, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { dayLong, shortTime } from "@/lib/days";
import type { ProjectLite } from "@/lib/schedule";
import type { OutlookEvent } from "@/lib/outlook/events";
import type { OutlookConnection } from "@/lib/outlook/data";
import { refreshOutlook } from "@/actions/outlook";
import { cn } from "@/lib/utils";
import { linkButton } from "@/components/outlook/link-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STALE_MS = 5 * 60 * 1000;

type OutlookValue = {
  events: OutlookEvent[];
  connections: OutlookConnection[];
  connected: boolean;
  projects: ProjectLite[];
  open: (id: string) => void;
  refresh: () => Promise<void>;
  refreshing: boolean;
};

const OutlookContext = createContext<OutlookValue | null>(null);

/** The page's Outlook events, or null on pages without them. */
export function useOutlook() {
  return use(OutlookContext);
}

function isStale(connections: OutlookConnection[], now: number) {
  return connections.some((c) => !c.last_synced_at || now - new Date(c.last_synced_at).getTime() > STALE_MS);
}

export function OutlookProvider({
  events: initialEvents,
  connections,
  projects,
  onlyProjectId,
  children,
}: {
  events: OutlookEvent[];
  connections: OutlookConnection[];
  projects: ProjectLite[]; // projects you can link an event to
  onlyProjectId?: string; // a project's own calendar: only events linked to it
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  // Your project links show at once; the server's copy catches up on refresh.
  const events = useMemo(
    () =>
      initialEvents
        .map((e) => (e.id in links ? { ...e, project_id: links[e.id] } : e))
        .filter((e) => !onlyProjectId || e.project_id === onlyProjectId),
    [initialEvents, links, onlyProjectId],
  );

  const refresh = useCallback(async () => {
    startRefresh(async () => {
      const res = await refreshOutlook(true);
      if (!res.ok) toast.error(res.error ?? "Couldn't refresh from Outlook.");
      router.refresh();
    });
  }, [router]);

  // Quietly bring the copy up to date when the page opens (and when you come
  // back to it), if it's more than a few minutes old.
  useEffect(() => {
    if (connections.length === 0) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible" || !isStale(connections, Date.now())) return;
      busy = true;
      const res = await refreshOutlook(false).catch(() => null);
      busy = false;
      if (res?.checked) router.refresh();
    };
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [connections, router]);

  const value = useMemo(
    () => ({
      events,
      connections,
      connected: connections.length > 0,
      projects,
      open: setOpenId,
      refresh,
      refreshing,
    }),
    [events, connections, projects, refresh, refreshing],
  );

  const opened = initialEvents.find((e) => e.id === openId);
  const shown = opened && (opened.id in links ? { ...opened, project_id: links[opened.id] } : opened);

  async function link(id: string, projectId: string | null) {
    const before = links;
    setLinks((l) => ({ ...l, [id]: projectId }));
    const { error } = await createClient().from("outlook_events").update({ project_id: projectId }).eq("id", id);
    if (error) {
      setLinks(before);
      toast.error("Couldn't link it to that project. Try again.");
      return;
    }
    const name = projects.find((p) => p.id === projectId)?.name;
    toast.success(name ? `Linked to ${name}` : "Unlinked from the project");
    router.refresh();
  }

  return (
    <OutlookContext value={value}>
      {children}
      <OutlookEventDialog event={shown ?? null} projects={projects} onClose={() => setOpenId(null)} onLink={link} />
    </OutlookContext>
  );
}

/** "09:30–10:00", "All day", or "All day, 3–4 Dec". */
export function outlookTime(e: OutlookEvent): string {
  if (e.all_day) return e.end_date > e.date ? `All day, until ${dayLong(e.end_date)}` : "All day";
  const from = shortTime(e.start_time) ?? "";
  const to = shortTime(e.end_time);
  return to && to !== from ? `${from}–${to}` : from;
}

function joinLabel(url: string) {
  return /teams\.microsoft\.com|teams\.live\.com/i.test(url) ? "Join Teams meeting" : "Join online meeting";
}

function OutlookEventDialog({
  event,
  projects,
  onClose,
  onLink,
}: {
  event: OutlookEvent | null;
  projects: ProjectLite[];
  onClose: () => void;
  onLink: (id: string, projectId: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {event && (
          <>
            <DialogHeader>
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-(--outlook)">
                <CalendarDays className="size-3.5" /> From your Outlook calendar
              </p>
              <DialogTitle className="[overflow-wrap:anywhere]">{event.title}</DialogTitle>
              <DialogDescription>
                {dayLong(event.date)} · {outlookTime(event)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {event.location && (
                <p className="flex items-start gap-2 [overflow-wrap:anywhere]">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {event.location}
                </p>
              )}
              {(event.join_url || event.web_link) && (
                <div className="flex flex-wrap gap-2">
                  {event.join_url && (
                    <a href={event.join_url} target="_blank" rel="noopener noreferrer" className={linkButton.small}>
                      <Video className="size-4" /> {joinLabel(event.join_url)}
                    </a>
                  )}
                  {event.web_link && (
                    <a href={event.web_link} target="_blank" rel="noopener noreferrer" className={linkButton.outline}>
                      <ExternalLink className="size-4" /> Open in Outlook
                    </a>
                  )}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Project</span>
                <span className="relative block">
                  <select
                    value={event.project_id ?? ""}
                    disabled={saving}
                    onChange={async (e) => {
                      setSaving(true);
                      await onLink(event.id, e.target.value || null);
                      setSaving(false);
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                  >
                    <option value="">Not linked to a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {saving && <Loader2 className="absolute right-8 top-2.5 size-4 animate-spin text-muted-foreground" />}
                </span>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  Linked meetings also show in that project&apos;s calendar and on its note on Home.
                </span>
              </label>
              <p className="rounded-md bg-(--sunken) px-3 py-2 text-xs text-muted-foreground">
                Only you can see this. To change the meeting itself, use Outlook.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "updating…";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `updated ${hours} h ago` : "updated over a day ago";
}

/**
 * The small Outlook button on calendars: "Connect Outlook" until you have,
 * then when it was last updated, with a refresh button.
 */
export function OutlookStatus({ promptToConnect = true }: { promptToConnect?: boolean }) {
  const outlook = useOutlook();
  // Re-render every minute so "updated 3 min ago" stays right.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!outlook) return null;
  const chip = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition hover:bg-accent";
  if (!outlook.connected) {
    if (!promptToConnect) return null;
    return (
      <Link href="/settings#outlook" className={cn(chip, "text-muted-foreground hover:text-foreground")}>
        <CalendarDays className="size-3.5 text-(--outlook)" /> Connect Outlook
      </Link>
    );
  }
  const problem = outlook.connections.find((c) => c.status === "error");
  if (problem) {
    return (
      <Link href="/settings#outlook" className={cn(chip, "text-(--warn)")} title={problem.last_error ?? undefined}>
        <AlertTriangle className="size-3.5" /> Outlook needs attention
      </Link>
    );
  }
  const latest = outlook.connections
    .map((c) => c.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(0) ?? null;
  return (
    <button
      type="button"
      onClick={() => void outlook.refresh()}
      disabled={outlook.refreshing}
      className={cn(chip, "text-muted-foreground hover:text-foreground disabled:opacity-70")}
      title="Refresh from Outlook now"
    >
      {outlook.refreshing ? (
        <Loader2 className="size-3.5 animate-spin text-(--outlook)" />
      ) : (
        <RefreshCw className="size-3.5 text-(--outlook)" />
      )}
      <span suppressHydrationWarning>Outlook · {outlook.refreshing ? "updating…" : ago(latest)}</span>
    </button>
  );
}
