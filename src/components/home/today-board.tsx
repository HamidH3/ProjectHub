"use client";

// The home page's sticky notes: one note per project with what's on today
// (meetings and to-dos you can tick off), plus an "Overdue" note when
// something has slipped.
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { dayLabel, shortTime } from "@/lib/days";
import { colorOf } from "@/lib/project-colors";
import { compareMeetings, compareTasks, type Meeting, type Task } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";
import { StickyNote } from "@/components/home/sticky-note";

const MAX_LINES = 6;
const TILTS = [-1.2, 0.9, -0.5, 1.3, -0.9, 0.6];
const OVERDUE_PAPER = "#f6c4b9";

function InkCheck({ task }: { task: Task }) {
  const { toggleTask } = useSchedule();
  const done = Boolean(task.completed_at);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      onClick={() => void toggleTask(task.id)}
      className="mt-[5px] flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-[#2b2b2b]/55 transition hover:border-[#2b2b2b]"
    >
      <Check strokeWidth={3.5} className={cn("size-3 text-[#2b2b2b] transition", done ? "opacity-100" : "opacity-0")} />
    </button>
  );
}

function TaskLine({ task, note: extra }: { task: Task; note?: string }) {
  const { setTaskDraft, personOf, meId } = useSchedule();
  const done = Boolean(task.completed_at);
  const time = shortTime(task.due_time);
  const forWho = task.assignee_id
    ? task.assignee_id === meId
      ? "For you"
      : `For ${personOf(task.assignee_id)?.name ?? "someone"}`
    : null;
  const note = [forWho, extra].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-2.5">
      <InkCheck task={task} />
      <button type="button" onClick={() => setTaskDraft({ task })} title={task.title} className="group/line min-w-0 flex-1 text-left">
        {/* Long to-dos stop after 3 lines; the full text is on hover and when you open it. */}
        <span className={cn("line-clamp-3 leading-7 group-hover/line:underline", done && "text-[#2b2b2b]/45 line-through")}>
          {time && <span className="mr-1.5 tabular-nums text-[#2b2b2b]/60">{time}</span>}
          {task.title}
        </span>
        {note && <span className="-mt-1 mb-1 block truncate text-xs leading-4 text-[#2b2b2b]/55">{note}</span>}
      </button>
    </li>
  );
}

function MeetingLine({ meeting }: { meeting: Meeting }) {
  const { setMeetingDraft } = useSchedule();
  const from = shortTime(meeting.start_time);
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden className="mt-[11px] h-0.5 w-4 shrink-0 rounded bg-[#2b2b2b]/55" />
      <button
        type="button"
        onClick={() => setMeetingDraft({ meeting })}
        title={meeting.title}
        className="min-w-0 flex-1 text-left font-medium leading-7 hover:underline"
      >
        <span className="line-clamp-3">
          <span className="mr-1.5 tabular-nums text-[#2b2b2b]/60">{from ?? "All day"}</span>
          {meeting.title}
        </span>
      </button>
    </li>
  );
}

export function TodayBoard() {
  const { today, tasks, meetings, projects } = useSchedule();

  const overdue = tasks
    .filter((t) => t.scheduled_date && t.scheduled_date < today)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!) || compareTasks(a, b));

  // Projects in the same order as the cards, keeping only those with something today.
  const notes = projects
    .map((p) => ({
      project: p,
      meetings: meetings.filter((m) => m.project_id === p.id && m.meeting_date === today).sort(compareMeetings),
      tasks: tasks.filter((t) => t.project_id === p.id && t.scheduled_date === today).sort(compareTasks),
    }))
    .filter((n) => n.meetings.length + n.tasks.length > 0);

  if (notes.length === 0 && overdue.length === 0) {
    return (
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StickyNote title="Nothing due today" paper={colorOf("yellow").paper} tilt={-1.2}>
          <p>A clear day. Add to-dos from a project&apos;s Tasks tab, or plan the week on the calendar.</p>
          <Link href="/calendar" className="mt-2 inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
            Open the calendar <ArrowRight className="size-3.5" />
          </Link>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {notes.map((n, i) => {
        const lines = [
          ...n.meetings.map((m) => <MeetingLine key={m.id} meeting={m} />),
          ...n.tasks.map((t) => <TaskLine key={t.id} task={t} />),
        ];
        const open = n.tasks.filter((t) => !t.completed_at).length;
        return (
          <StickyNote key={n.project.id} title={n.project.name} paper={colorOf(n.project.color).paper} tilt={TILTS[i % TILTS.length]}>
            <p className="-mt-1 text-xs text-[#2b2b2b]/60">
              {open === 0 && n.tasks.length > 0 ? "All done for today" : `${open} to-do${open === 1 ? "" : "s"} left`}
              {n.meetings.length > 0 && ` · ${n.meetings.length} meeting${n.meetings.length === 1 ? "" : "s"}`}
            </p>
            <ul className="mt-1">{lines.slice(0, MAX_LINES)}</ul>
            <Link
              href={`/projects/${n.project.id}/tasks`}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#2b2b2b]/70 underline-offset-4 hover:underline"
            >
              {lines.length > MAX_LINES ? `+${lines.length - MAX_LINES} more` : "Open tasks"} <ArrowRight className="size-3" />
            </Link>
          </StickyNote>
        );
      })}

      {overdue.length > 0 && (
        <StickyNote title="Overdue" paper={OVERDUE_PAPER} tilt={TILTS[notes.length % TILTS.length]}>
          <p className="-mt-1 text-xs text-[#2b2b2b]/60">
            {overdue.filter((t) => !t.completed_at).length} still to do from earlier days
          </p>
          <ul className="mt-1">
            {overdue.slice(0, MAX_LINES).map((t) => {
              const project = projects.find((p) => p.id === t.project_id);
              return <TaskLine key={t.id} task={t} note={[dayLabel(t.scheduled_date!, today), project?.name].filter(Boolean).join(" · ")} />;
            })}
          </ul>
          {overdue.length > MAX_LINES && (
            <p className="mt-1 text-xs text-[#2b2b2b]/60">+{overdue.length - MAX_LINES} more in your projects&apos; Tasks tabs</p>
          )}
        </StickyNote>
      )}
    </div>
  );
}
