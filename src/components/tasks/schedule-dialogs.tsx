"use client";

// The "Edit to-do" and "Meeting" dialogs. There's one of each per page; any
// list or calendar opens them through setTaskDraft / setMeetingDraft.
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX, LOCATION_MAX, MEETING_TITLE_MAX, PRIORITIES, PRIORITY_NAMES, TITLE_MAX, type Priority } from "@/lib/schedule";
import { shortTime } from "@/lib/days";
import { cn } from "@/lib/utils";
import { useSchedule, type MeetingDraft, type TaskDraft } from "@/components/tasks/schedule-context";
import { AssigneeSelect } from "@/components/tasks/assignee";
import { assignableFor } from "@/lib/schedule";

export function ScheduleDialogs() {
  const { taskDraft, setTaskDraft, meetingDraft, setMeetingDraft } = useSchedule();
  return (
    <>
      <Dialog open={taskDraft !== null} onOpenChange={(open) => !open && setTaskDraft(null)}>
        {/* key: start with fresh fields each time it opens */}
        {taskDraft && <TaskForm key={"task" in taskDraft ? taskDraft.task.id : "new"} draft={taskDraft} />}
      </Dialog>
      <Dialog open={meetingDraft !== null} onOpenChange={(open) => !open && setMeetingDraft(null)}>
        {meetingDraft && (
          <MeetingForm key={"meeting" in meetingDraft ? meetingDraft.meeting.id : "new"} draft={meetingDraft} />
        )}
      </Dialog>
    </>
  );
}

const fieldClass = "[color-scheme:dark]";

export function ProjectSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (id: string) => void;
  id: string;
}) {
  const { projects } = useSchedule();
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function PriorityPicker({ value, onChange }: { value: Priority | null; onChange: (p: Priority | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Priority" className="flex flex-wrap gap-1.5">
      {[null, ...PRIORITY_NAMES].map((p) => {
        const selected = value === p;
        return (
          <button
            key={p ?? "none"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
              selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {p && <span className="size-2 rounded-full" style={{ backgroundColor: PRIORITIES[p].color }} />}
            {p ? PRIORITIES[p].label : "None"}
          </button>
        );
      })}
    </div>
  );
}

function TaskForm({ draft }: { draft: TaskDraft }) {
  const { projects, fixedProjectId, today, team, meId, personOf, addTask, updateTask, deleteTask, setTaskDraft } =
    useSchedule();
  const existing = "task" in draft ? draft.task : null;
  const start = existing ?? ("defaults" in draft ? draft.defaults : {});
  const [title, setTitle] = useState(start.title ?? "");
  const [description, setDescription] = useState(start.description ?? "");
  const [date, setDate] = useState(start.scheduled_date ?? "");
  const [time, setTime] = useState(shortTime(start.due_time) ?? "");
  const [priority, setPriority] = useState<Priority | null>(start.priority ?? null);
  const [projectId, setProjectId] = useState(start.project_id ?? fixedProjectId ?? projects[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState(start.assignee_id ?? "");
  const addedBy = existing?.created_by ? personOf(existing.created_by) : undefined;

  // Moving it to another project: keep the person only if they're on that one too.
  function changeProject(id: string) {
    setProjectId(id);
    if (assigneeId && !assignableFor(team, id, meId).some((p) => p.id === assigneeId)) setAssigneeId("");
  }
  const [pending, startTransition] = useTransition();
  const close = () => setTaskDraft(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const fields = {
        title,
        description,
        scheduled_date: date || null,
        due_time: time || null,
        priority,
        assignee_id: assigneeId || null,
      };
      const ok = existing
        ? await updateTask(existing.id, { ...fields, project_id: projectId })
        : await addTask({ ...fields, project_id: projectId });
      if (ok) close();
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={save} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit to-do" : "New to-do"}</DialogTitle>
          <DialogDescription className={cn(!addedBy && "sr-only")}>
            {addedBy ? `Added by ${addedBy.id === meId ? "you" : addedBy.name}` : "Name, day, time, who it's for, priority and notes."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="task-title">To-do</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            required
            autoFocus
            placeholder="e.g. Send the proposal to the client"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="task-date">Day</Label>
            <Input id="task-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-time">Time (optional)</Label>
            <Input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div className="-mt-2 flex flex-wrap gap-1.5 text-xs">
          {[
            { label: "Today", day: today },
            { label: "No day", day: "" },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setDate(q.day)}
              className="rounded-md px-2 py-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {q.label}
            </button>
          ))}
        </div>

        {!fixedProjectId && projects.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor="task-project">Project</Label>
            <ProjectSelect id="task-project" value={projectId} onChange={changeProject} />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="task-assignee">Assign to</Label>
          <AssigneeSelect id="task-assignee" projectId={projectId} value={assigneeId} onChange={setAssigneeId} />
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Priority</span>
          <PriorityPicker value={priority} onChange={setPriority} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="task-notes">Notes (optional)</Label>
          <Textarea
            id="task-notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={3}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {existing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                close();
                void deleteTask(existing.id);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !projectId}>
              {existing ? "Save" : "Add to-do"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function MeetingForm({ draft }: { draft: MeetingDraft }) {
  const { projects, fixedProjectId, today, addMeeting, updateMeeting, deleteMeeting, setMeetingDraft } = useSchedule();
  const existing = "meeting" in draft ? draft.meeting : null;
  const start = existing ?? ("defaults" in draft ? draft.defaults : {});
  const [title, setTitle] = useState(start.title ?? "");
  const [date, setDate] = useState(start.meeting_date ?? today);
  const [from, setFrom] = useState(shortTime(start.start_time) ?? "");
  const [to, setTo] = useState(shortTime(start.end_time) ?? "");
  const [location, setLocation] = useState(start.location ?? "");
  const [notes, setNotes] = useState(start.notes ?? "");
  const [projectId, setProjectId] = useState(start.project_id ?? fixedProjectId ?? projects[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const close = () => setMeetingDraft(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const fields = {
        title,
        meeting_date: date,
        start_time: from || null,
        end_time: to || null,
        location,
        notes,
        project_id: projectId,
      };
      const ok = existing ? await updateMeeting(existing.id, fields) : await addMeeting(fields);
      if (ok) close();
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={save} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit meeting" : "New meeting"}</DialogTitle>
          <DialogDescription className="sr-only">Name, day, time and place for this meeting.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="meeting-title">Meeting</Label>
          <Input
            id="meeting-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MEETING_TITLE_MAX}
            required
            autoFocus
            placeholder="e.g. Weekly check-in with the client"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="meeting-date">Day</Label>
            <Input id="meeting-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={fieldClass} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="meeting-from">From</Label>
            <Input id="meeting-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="meeting-to">To</Label>
            <Input id="meeting-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Leave the times empty for an all-day event.</p>

        <div className="grid gap-1.5">
          <Label htmlFor="meeting-location">Where (optional)</Label>
          <Input
            id="meeting-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={LOCATION_MAX}
            placeholder="Room, address or video-call link"
          />
        </div>

        {!fixedProjectId && projects.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor="meeting-project">Project</Label>
            <ProjectSelect id="meeting-project" value={projectId} onChange={setProjectId} />
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="meeting-notes">Agenda / notes (optional)</Label>
          <Textarea id="meeting-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {existing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                close();
                void deleteMeeting(existing.id);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !date || !projectId}>
              {existing ? "Save" : "Add meeting"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
