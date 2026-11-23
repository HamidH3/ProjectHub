"use client";

// Settings → Outlook calendar: connect your Outlook calendar so your meetings
// show in ProjectHub (only to you). Two ways: "Sign in with Microsoft" (one
// click, if this site has it set up and your company allows it), or paste the
// calendar's published ICS link.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { addCalendarLink, disconnectOutlook, refreshOutlook } from "@/actions/outlook";
import type { OutlookConnection } from "@/lib/outlook/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkButton } from "@/components/outlook/link-button";

// What happened after "Sign in with Microsoft" (from ?outlook=…).
const RESULTS: Record<string, { tone: "ok" | "warn"; text: string }> = {
  connected: { tone: "ok", text: "Outlook is connected. Your meetings now show on the Calendar and on Home." },
  admin: {
    tone: "warn",
    text: "Your organisation needs to approve ProjectHub before you can sign in with your work account. Ask your IT team, or use a calendar link below instead.",
  },
  cancelled: { tone: "warn", text: "Sign-in was cancelled, so nothing was connected." },
  expired: { tone: "warn", text: "That sign-in took too long or was started in another window. Please try again." },
  failed: { tone: "warn", text: "Microsoft sign-in didn't work. Please try again in a minute." },
  unavailable: { tone: "warn", text: "Sign in with Microsoft isn't set up on this site. Use a calendar link below instead." },
  busy: { tone: "warn", text: "Too many tries. Wait a little and try again." },
};

function MicrosoftLogo() {
  return (
    <svg aria-hidden viewBox="0 0 21 21" className="size-4">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function updated(iso: string | null, timeZone: string) {
  if (!iso) return "Updating…";
  return `Updated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso))}`;
}

function Connected({ c, timezone }: { c: OutlookConnection; timezone: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const title = c.kind === "microsoft" ? `Signed in as ${c.label ?? "your Microsoft account"}` : "Connected with a calendar link";
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-(--outlook)/15 text-(--outlook)">
          {c.kind === "microsoft" ? <MicrosoftLogo /> : <Link2 className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className={cn("text-xs", c.status === "error" ? "text-(--warn)" : "text-muted-foreground")}>
            {c.status === "error" ? c.last_error ?? "Couldn't update from Outlook." : updated(c.last_synced_at, timezone)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "error" && c.kind === "microsoft" ? (
            <a href="/api/outlook/connect" className={linkButton.small}>
              Reconnect
            </a>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const res = await refreshOutlook(true);
                  if (res.ok) toast.success("Updated from Outlook");
                  else toast.error(res.error ?? "Couldn't refresh.");
                  router.refresh();
                })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh
            </Button>
          )}
          {confirming ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const res = await disconnectOutlook(c.kind);
                  if (res.ok) toast.success(res.message ?? "Disconnected");
                  else toast.error(res.error);
                  setConfirming(false);
                  router.refresh();
                })
              }
            >
              Yes, disconnect
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              <Unplug className="size-4" /> Disconnect
            </Button>
          )}
        </div>
      </div>
      {confirming && (
        <p className="mt-2 text-xs text-muted-foreground">
          This removes your Outlook meetings from ProjectHub (and their links to projects). Your Outlook calendar isn&apos;t changed.
        </p>
      )}
    </div>
  );
}

function LinkForm({ open: startOpen }: { open: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="px-5 py-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left text-sm font-medium"
      >
        <Link2 className="size-4 text-(--outlook)" />
        <span className="flex-1">Use a calendar link instead</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Open Outlook on the web (
              <a href="https://outlook.office.com/calendar/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                outlook.office.com
              </a>
              ), press the <b>Settings</b> cog, then <b>Calendar → Shared calendars</b>.
            </li>
            <li>
              Under <b>Publish a calendar</b>, pick <b>Calendar</b> and <b>Can view all details</b>, then press <b>Publish</b>.
            </li>
            <li>
              Copy the <b>ICS</b> link (it ends in <code>.ics</code>) and paste it here.
            </li>
          </ol>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const res = await addCalendarLink(link);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                toast.success(res.message ?? "Connected");
                setLink("");
                router.refresh();
              });
            }}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
              aria-label="Calendar ICS link"
              autoComplete="off"
              spellCheck={false}
              className="flex-1"
            />
            <Button type="submit" disabled={busy || !link.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Connect
            </Button>
          </form>
          {error && (
            <p role="alert" className="text-xs text-(--danger-soft)">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Keep this link private: anyone who has it can see your calendar. If you don&apos;t see &ldquo;Publish a calendar&rdquo;,
            your company has switched it off. Calendar links update about every 5 minutes while ProjectHub is open.
          </p>
        </div>
      )}
    </div>
  );
}

export function OutlookSettings({
  connections,
  microsoftAvailable,
  timezone,
  result,
}: {
  connections: OutlookConnection[];
  microsoftAvailable: boolean;
  timezone: string;
  result?: string;
}) {
  const message = result ? RESULTS[result] : undefined;
  const microsoft = connections.find((c) => c.kind === "microsoft");
  const link = connections.find((c) => c.kind === "link");
  return (
    <div className="divide-y divide-border">
      {message && (
        <p
          role="status"
          className={cn("px-5 py-3 text-sm", message.tone === "ok" ? "bg-(--ok)/10 text-(--ok)" : "bg-(--warn)/10 text-(--warn)")}
        >
          {message.text}
        </p>
      )}
      {connections.length === 0 && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-(--outlook)" />
            See your Outlook meetings on ProjectHub&apos;s Calendar and Home page, and link them to projects. Only you see
            them. ProjectHub only reads your calendar (times, titles, places and Teams links) and never changes it.
          </p>
        </div>
      )}
      {microsoft && <Connected c={microsoft} timezone={timezone} />}
      {link && <Connected c={link} timezone={timezone} />}
      {!microsoft && microsoftAvailable && (
        <div className="px-5 py-4">
          <a href="/api/outlook/connect" className={linkButton.primary}>
            <MicrosoftLogo /> Sign in with Microsoft
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Works with work and personal Outlook accounts. Some companies ask IT to approve ProjectHub first.
            {link && " Signing in replaces your calendar link and updates more reliably."}
          </p>
        </div>
      )}
      {!link && !microsoft && <LinkForm open={!microsoftAvailable} />}
    </div>
  );
}
