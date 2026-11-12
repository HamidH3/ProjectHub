"use client";

// Adding to-dos fast: the bar at the top of the Tasks tab, and the small
// "+ Add to-do" line under each day.
import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIORITIES, PRIORITY_NAMES, TITLE_MAX, type Priority } from "@/lib/schedule";
import type { Day } from "@/lib/days";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";
import { ProjectSelect } from "@/components/tasks/schedule-dialogs";
import { AssigneeSelect } from "@/components/tasks/assignee";
import { assignableFor } from "@/lib/schedule";

const smallField =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground outline-none [color-scheme:dark] focus-visible:border-ring focus-visible:text-foreground";

export function QuickAdd({ defaultDay }: { defaultDay: Day | null }) {
  const { projects, fixedProjectId, team, meId, addTask } = useSchedule();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [day, setDay] = useState<string>(defaultDay ?? "");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      const ok = await addTask({
        project_id: projectId,
        title,
        scheduled_date: day || null,
        due_time: time || null,
        priority: priority || null,
        assignee_id: assigneeId || null,
      });
      if (ok) {
        // Keep the day, project and person so you can add several in a row.
        setTitle("");
        setTime("");
        setPriority("");
        inputRef.current?.focus();
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 focus-within:border-ring/60"
    >
      <label className="flex min-w-48 flex-1 items-center gap-2 px-1.5">
        <Plus className="size-4 shrink-0 text-primary" />
        <span className="sr-only">New to-do</span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Add a to-do and press Enter"
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={smallField} />
        <input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} className={smallField} />
        <select
          aria-label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          className={cn(smallField, priority && "text-foreground")}
        >
          <option value="">No priority</option>
          {PRIORITY_NAMES.map((p) => (
            <option key={p} value={p}>
              {PRIORITIES[p].label} priority
            </option>
          ))}
        </select>
        {!fixedProjectId && projects.length > 1 && (
          <div className="w-40">
            <ProjectSelect
              id="quick-add-project"
              value={projectId}
              onChange={(id) => {
                setProjectId(id);
                if (assigneeId && !assignableFor(team, id, meId).some((p) => p.id === assigneeId)) setAssigneeId("");
              }}
            />
          </div>
        )}
        <div className="w-44">
          <AssigneeSelect
            projectId={projectId}
            value={assigneeId}
            onChange={setAssigneeId}
            emptyLabel="Assign to…"
            className={cn("h-8 text-xs", !assigneeId && "text-muted-foreground")}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending || !title.trim() || !projectId}>
          Add
        </Button>
      </div>
    </form>
  );
}

// "+ Add to-do" under a day: click, type, Enter. Esc or clicking away closes it.
export function InlineAdd({ day, label = "Add to-do" }: { day: Day | null; label?: string }) {
  const { projects, fixedProjectId, addTask } = useSchedule();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const projectId = fixedProjectId ?? projects[0]?.id ?? "";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-[#1f1f1f] hover:text-primary"
      >
        <Plus className="size-[18px] shrink-0 p-0.5" />
        {label}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          const ok = await addTask({ project_id: projectId, title, scheduled_date: day, due_time: null, priority: null });
          if (ok) setTitle("");
        });
      }}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5"
    >
      <Plus className="size-[18px] shrink-0 p-0.5 text-primary" />
      <input
        autoFocus
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => !title.trim() && setOpen(false)}
        maxLength={TITLE_MAX}
        aria-label="New to-do"
        placeholder="Type and press Enter"
        className="h-7 w-full border-b border-border bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </form>
  );
}
