"use client";

// The meeting recorder page: a form to send the bot, and your meetings with
// where each one has got to. While a meeting is in progress the page checks in
// every few seconds, so it updates by itself.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Mic, RotateCw, Sparkles, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RecordingSummary } from "@/lib/meetings/data";
import { ACTIVE, IN_CALL, isStatus, STATUS_LABEL, type RecordingStatus } from "@/lib/meetings/words";
import {
  assignRecording,
  checkRecordings,
  deleteRecording,
  retryRecording,
  sendBot,
  stopBot,
} from "@/actions/meetings";

type ProjectOption = { id: string; name: string };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const POLL_MS = 8000;

function statusOf(r: RecordingSummary): RecordingStatus {
  return isStatus(r.status) ? r.status : "joining";
}

export function RecorderView({
  recordings,
  projects,
  missing,
}: {
  recordings: RecordingSummary[];
  projects: ProjectOption[];
  missing: string[];
}) {
  const router = useRouter();
  const active = recordings.some((r) => ACTIVE.includes(statusOf(r)));

  // Keep checking while something is happening.
  const busy = useRef(false);
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        await checkRecordings();
        router.refresh();
      } finally {
        busy.current = false;
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, router]);

  const waiting = recordings.filter((r) => statusOf(r) === "ready" && !r.project_id);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Mic className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meeting recorder</h1>
          <p className="text-sm text-muted-foreground">
            A notetaker joins your meeting, records it, and writes AI notes into the project you choose.
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <div role="alert" className="mt-6 rounded-xl border border-(--warn) bg-(--warn)/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> The meeting bot isn&apos;t set up yet
          </p>
          <p className="mt-1 text-muted-foreground">
            Add these settings in Vercel (and in <code>.env.local</code> on your computer), then redeploy:{" "}
            <b>{missing.join(", ")}</b>.
          </p>
        </div>
      )}

      <SendForm projects={projects} disabled={missing.length > 0} />

      {waiting.length > 0 && (
        <p className="mt-8 rounded-lg bg-primary/10 px-4 py-3 text-sm" role="status">
          <b>{waiting.length === 1 ? "1 meeting needs" : `${waiting.length} meetings need`} a project.</b> Pick which
          project the notes belong to below.
        </p>
      )}

      <h2 className="mt-8 text-sm font-semibold tracking-wider text-muted-foreground uppercase">Your meetings</h2>
      {recordings.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No meetings yet. Paste a meeting link above to send the notetaker.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {recordings.map((r) => (
            <RecordingCard key={r.id} recording={r} projects={projects} />
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        The bot (“ProjectHub Notetaker”) posts a message in the meeting chat saying it&apos;s recording. Make sure
        everyone is happy to be recorded. Once ProjectHub has the transcript, the recording is deleted from Recall.ai.
        Summaries are written by Claude.
      </p>
    </div>
  );
}

function SendForm({ projects, disabled }: { projects: ProjectOption[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await sendBot(data);
          if (result.ok) {
            toast.success(result.message ?? "Bot sent");
            form.current?.reset();
            router.refresh();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="meeting-url">Meeting link</Label>
        <Input
          id="meeting-url"
          name="url"
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://teams.microsoft.com/l/meetup-join/…"
          disabled={disabled || pending}
        />
        <p className="text-xs text-muted-foreground">Microsoft Teams, Zoom or Google Meet. The meeting should already have started, or start soon.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-title">Name (optional)</Label>
          <Input id="meeting-title" name="title" maxLength={200} placeholder="Weekly catch-up" disabled={disabled || pending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meeting-project">Project</Label>
          <select id="meeting-project" name="projectId" defaultValue="" className={selectClass} disabled={disabled || pending}>
            <option value="">Ask me after the meeting</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={disabled || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
        {pending ? "Sending…" : "Send notetaker"}
      </Button>
    </form>
  );
}

function StatusBadge({ status }: { status: RecordingStatus }) {
  const tone =
    status === "failed"
      ? "bg-(--danger-soft) text-destructive"
      : status === "filed"
        ? "bg-(--ok)/15 text-(--ok)"
        : status === "ready"
          ? "bg-primary/15 text-primary"
          : "bg-(--chip) text-foreground/80";
  const spinning = ACTIVE.includes(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
      {status === "recording" ? (
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-red-500" />
      ) : spinning ? (
        <Loader2 className="size-3 animate-spin" />
      ) : status === "filed" ? (
        <CheckCircle2 className="size-3" />
      ) : status === "failed" ? (
        <AlertTriangle className="size-3" />
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

function RecordingCard({ recording: r, projects }: { recording: RecordingSummary; projects: ProjectOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [projectId, setProjectId] = useState("");
  const status = statusOf(r);
  const project = projects.find((p) => p.id === r.project_id);
  const needsProject = status !== "filed" && status !== "failed" && !r.project_id;
  const when = new Date(r.created_at).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  let host = "";
  try {
    host = new URL(r.meeting_url).hostname;
  } catch {
    host = "";
  }

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
      router.refresh();
    });

  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4",
        status === "ready" && needsProject ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{r.summary_title || r.title}</p>
          <p className="text-xs text-muted-foreground">
            {when}
            {host && ` · ${host}`}
            {project && ` · ${project.name}`}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {r.status_detail && (
        <p className={cn("mt-2 text-sm", status === "failed" ? "text-destructive" : "text-muted-foreground")}>{r.status_detail}</p>
      )}

      {needsProject && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (!projectId) return toast.error("Pick a project.");
            run(() => assignRecording(r.id, projectId));
          }}
        >
          <label htmlFor={`project-${r.id}`} className="text-sm font-medium sm:whitespace-nowrap">
            {status === "ready" ? "Which project is this meeting for?" : "Project for the notes:"}
          </label>
          <select
            id={`project-${r.id}`}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={cn(selectClass, "sm:max-w-64")}
            disabled={pending}
          >
            <option value="">Choose…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={pending || !projectId}>
            {status === "ready" ? "Add notes" : "Save"}
          </Button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "filed" && r.note_id && r.project_id && (
          <Link
            href={`/projects/${r.project_id}/notes/${r.note_id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="size-3.5" /> Open AI notes
          </Link>
        )}
        {isStatus(r.status) && IN_CALL.includes(status) && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => stopBot(r.id))}>
            <Square className="size-3.5" /> Stop recording
          </Button>
        )}
        {status === "failed" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryRecording(r.id))}>
            <RotateCw className="size-3.5" /> Try again
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-muted-foreground"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${r.title}`}
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              The transcript and summary kept here are deleted{IN_CALL.includes(status) ? ", and the bot leaves the meeting" : ""}.
              AI notes already added to a project stay there.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteRecording(r.id));
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
