"use client";

// Shared state for to-dos and meetings on a page (the Tasks tab, a calendar or
// the home page): the lists, and the actions that change them. Changes show
// straight away and go to the database through the browser client; if the
// database refuses (its security rules decide), the change is put back.
import { createContext, use, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Day } from "@/lib/days";
import {
  MEETING_COLUMNS,
  TASK_COLUMNS,
  checkMeeting,
  checkTaskTitle,
  type Meeting,
  type Priority,
  type ProjectLite,
  type Task,
} from "@/lib/schedule";

export type TaskInput = {
  project_id: string;
  title: string;
  description?: string | null;
  scheduled_date: Day | null;
  due_time: string | null;
  priority: Priority | null;
};
export type TaskPatch = Partial<Omit<TaskInput, "project_id">> & { project_id?: string; completed_at?: string | null };

export type MeetingInput = {
  project_id: string;
  title: string;
  meeting_date: Day;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
};

// What the edit dialogs are showing: an existing item, or a new one with some
// fields filled in (e.g. the day you clicked on).
export type TaskDraft = { task: Task } | { defaults: Partial<TaskInput> };
export type MeetingDraft = { meeting: Meeting } | { defaults: Partial<MeetingInput> };

type ScheduleValue = {
  today: Day;
  projects: ProjectLite[]; // projects you can add to (one on a project page, all on the home page / calendar)
  fixedProjectId: string | null; // set on a project's own pages
  tasks: Task[];
  meetings: Meeting[];
  projectOf: (id: string) => ProjectLite | undefined;
  addTask: (input: TaskInput) => Promise<boolean>;
  updateTask: (id: string, patch: TaskPatch) => Promise<boolean>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addMeeting: (input: MeetingInput) => Promise<boolean>;
  updateMeeting: (id: string, patch: Partial<MeetingInput>) => Promise<boolean>;
  deleteMeeting: (id: string) => Promise<void>;
  taskDraft: TaskDraft | null;
  setTaskDraft: (draft: TaskDraft | null) => void;
  meetingDraft: MeetingDraft | null;
  setMeetingDraft: (draft: MeetingDraft | null) => void;
};

const ScheduleContext = createContext<ScheduleValue | null>(null);

export function useSchedule() {
  const value = use(ScheduleContext);
  if (!value) throw new Error("useSchedule must be used inside ScheduleProvider");
  return value;
}

function clean(text: string | null | undefined, max: number): string | null {
  const t = (text ?? "").trim();
  return t ? t.slice(0, max) : null;
}

function tidyMeeting(m: Partial<MeetingInput>): Partial<MeetingInput> {
  const out: Partial<MeetingInput> = { ...m };
  if (out.title !== undefined) out.title = out.title.trim();
  if (out.start_time !== undefined) out.start_time = out.start_time || null;
  if (out.end_time !== undefined) out.end_time = out.end_time || null;
  if (out.location !== undefined) out.location = clean(out.location, 500);
  if (out.notes !== undefined) out.notes = clean(out.notes, 5000);
  return out;
}

export function ScheduleProvider({
  today,
  projects,
  fixedProjectId = null,
  initialTasks,
  initialMeetings,
  children,
}: {
  today: Day;
  projects: ProjectLite[];
  fixedProjectId?: string | null;
  initialTasks: Task[];
  initialMeetings: Meeting[];
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState(initialTasks);
  const [meetings, setMeetings] = useState(initialMeetings);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft | null>(null);

  // When the server sends fresh data (e.g. moving to another month), use it.
  const [seen, setSeen] = useState({ initialTasks, initialMeetings });
  if (seen.initialTasks !== initialTasks || seen.initialMeetings !== initialMeetings) {
    setSeen({ initialTasks, initialMeetings });
    setTasks(initialTasks);
    setMeetings(initialMeetings);
  }

  const projectOf = useCallback((id: string) => projects.find((p) => p.id === id), [projects]);

  // ---- to-dos ------------------------------------------------------------
  const addTask = useCallback(
    async (input: TaskInput) => {
      const problem = checkTaskTitle(input.title);
      if (problem) {
        toast.error(problem);
        return false;
      }
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          project_id: input.project_id,
          title: input.title.trim(),
          description: clean(input.description, 5000),
          scheduled_date: input.scheduled_date,
          due_time: input.due_time || null,
          priority: input.priority,
        })
        .select(TASK_COLUMNS)
        .single();
      if (error || !data) {
        toast.error("Couldn't add the to-do. Try again.");
        return false;
      }
      setTasks((all) => [...all, data]);
      return true;
    },
    [supabase],
  );

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      if (patch.title !== undefined) {
        const problem = checkTaskTitle(patch.title);
        if (problem) {
          toast.error(problem);
          return false;
        }
      }
      const change: TaskPatch = { ...patch };
      if (change.title !== undefined) change.title = change.title.trim();
      if (change.description !== undefined) change.description = clean(change.description, 5000);
      if (change.due_time !== undefined) change.due_time = change.due_time || null;

      const before = tasks.find((t) => t.id === id);
      if (!before) return false;
      setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t)));
      const { error } = await supabase.from("tasks").update(change).eq("id", id);
      if (error) {
        setTasks((all) => all.map((t) => (t.id === id ? before : t)));
        toast.error("Couldn't save the change. Try again.");
        return false;
      }
      return true;
    },
    [supabase, tasks],
  );

  const toggleTask = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const completing = !task.completed_at;
      const ok = await updateTask(id, { completed_at: completing ? new Date().toISOString() : null });
      if (ok && completing) {
        toast.success("To-do done", {
          description: task.title,
          action: { label: "Undo", onClick: () => void updateTask(id, { completed_at: null }) },
        });
      }
    },
    [tasks, updateTask],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      setTasks((all) => all.filter((t) => t.id !== id));
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        setTasks((all) => [...all, task]);
        toast.error("Couldn't delete the to-do.");
        return;
      }
      toast("To-do deleted", {
        description: task.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const { data, error: undoError } = await supabase.from("tasks").insert(task).select(TASK_COLUMNS).single();
            if (undoError || !data) toast.error("Couldn't bring it back.");
            else setTasks((all) => [...all, data]);
          },
        },
      });
    },
    [supabase, tasks],
  );

  // ---- meetings ----------------------------------------------------------
  const addMeeting = useCallback(
    async (input: MeetingInput) => {
      const m = tidyMeeting(input) as MeetingInput;
      const problem = checkMeeting(m);
      if (problem) {
        toast.error(problem);
        return false;
      }
      const { data, error } = await supabase.from("meetings").insert(m).select(MEETING_COLUMNS).single();
      if (error || !data) {
        toast.error("Couldn't add the meeting. Try again.");
        return false;
      }
      setMeetings((all) => [...all, data]);
      return true;
    },
    [supabase],
  );

  const updateMeeting = useCallback(
    async (id: string, patch: Partial<MeetingInput>) => {
      const before = meetings.find((m) => m.id === id);
      if (!before) return false;
      const change = tidyMeeting(patch);
      const problem = checkMeeting({ ...before, ...change });
      if (problem) {
        toast.error(problem);
        return false;
      }
      setMeetings((all) => all.map((m) => (m.id === id ? { ...m, ...change } : m)));
      const { error } = await supabase.from("meetings").update(change).eq("id", id);
      if (error) {
        setMeetings((all) => all.map((m) => (m.id === id ? before : m)));
        toast.error("Couldn't save the meeting. Try again.");
        return false;
      }
      return true;
    },
    [meetings, supabase],
  );

  const deleteMeeting = useCallback(
    async (id: string) => {
      const meeting = meetings.find((m) => m.id === id);
      if (!meeting) return;
      setMeetings((all) => all.filter((m) => m.id !== id));
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) {
        setMeetings((all) => [...all, meeting]);
        toast.error("Couldn't delete the meeting.");
        return;
      }
      toast("Meeting deleted", {
        description: meeting.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const { data, error: undoError } = await supabase
              .from("meetings")
              .insert(meeting)
              .select(MEETING_COLUMNS)
              .single();
            if (undoError || !data) toast.error("Couldn't bring it back.");
            else setMeetings((all) => [...all, data]);
          },
        },
      });
    },
    [meetings, supabase],
  );

  const value = useMemo<ScheduleValue>(
    () => ({
      today,
      projects,
      fixedProjectId,
      tasks,
      meetings,
      projectOf,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      addMeeting,
      updateMeeting,
      deleteMeeting,
      taskDraft,
      setTaskDraft,
      meetingDraft,
      setMeetingDraft,
    }),
    [
      today,
      projects,
      fixedProjectId,
      tasks,
      meetings,
      projectOf,
      addTask,
      updateTask,
      toggleTask,
      deleteTask,
      addMeeting,
      updateMeeting,
      deleteMeeting,
      taskDraft,
      meetingDraft,
    ],
  );

  return <ScheduleContext value={value}>{children}</ScheduleContext>;
}
