"use client";

// The Tasks tab: "Upcoming" (overdue, each of the next seven days, later, no
// day) and "Completed". Meetings in the coming week show under their day.
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayInZone, dayLabel, dayShort, type Day } from "@/lib/days";
import { compareMeetings, groupUpcoming, type Task, type TaskGroup } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";
import { InlineAdd, QuickAdd } from "@/components/tasks/quick-add";
import { MeetingItem, TaskItem } from "@/components/tasks/task-item";

type View = "upcoming" | "completed";
type Who = "everyone" | "mine";

export function TasksView({ timezone, calendarHref }: { timezone: string; calendarHref: string }) {
  const { today, tasks: allTasks, meetings, team, meId, setMeetingDraft } = useSchedule();
  const [view, setView] = useState<View>("upcoming");
  const [who, setWho] = useState<Who>("everyone");

  // "For me" shows only the to-dos assigned to you.
  const tasks = useMemo(
    () => (who === "mine" ? allTasks.filter((t) => t.assignee_id === meId) : allTasks),
    [allTasks, who, meId],
  );
  const mineCount = allTasks.filter((t) => !t.completed_at && t.assignee_id === meId).length;
  const groups = useMemo(() => groupUpcoming(tasks, today), [tasks, today]);
  const openCount = tasks.filter((t) => !t.completed_at).length;
  const doneCount = tasks.length - openCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Which to-dos" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(
            [
              ["upcoming", `Upcoming · ${openCount}`],
              ["completed", `Completed · ${doneCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                view === key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {team.people.length > 1 && (
          <div role="group" aria-label="Whose to-dos" className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(
              [
                ["everyone", "Everyone"],
                ["mine", `For me · ${mineCount}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={who === key}
                onClick={() => setWho(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  who === key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => setMeetingDraft({ defaults: { meeting_date: today } })}>
            <Users className="size-4" /> New meeting
          </Button>
          <Link
            href={calendarHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition hover:bg-accent"
          >
            <CalendarDays className="size-4" /> Calendar
          </Link>
        </div>
      </div>

      {view === "upcoming" ? (
        <>
          <QuickAdd defaultDay={today} />
          <div className="space-y-6">
            {groups.map((g) => (
              <GroupSection
                key={g.key}
                group={g}
                meetings={g.kind === "day" ? meetings.filter((m) => m.meeting_date === g.day).sort(compareMeetings) : []}
              />
            ))}
          </div>
        </>
      ) : (
        <CompletedList timezone={timezone} tasks={tasks} />
      )}
    </div>
  );
}

function groupTitle(group: TaskGroup, today: Day) {
  if (group.kind === "overdue") return { title: "Overdue", sub: null };
  if (group.kind === "later") return { title: "Later", sub: null };
  if (group.kind === "undated") return { title: "No day", sub: null };
  const label = dayLabel(group.day!, today);
  return { title: label, sub: dayShort(group.day!) };
}

function GroupSection({ group, meetings }: { group: TaskGroup; meetings: ReturnType<typeof useSchedule>["meetings"] }) {
  const { today } = useSchedule();
  const { title, sub } = groupTitle(group, today);
  const isToday = group.kind === "day" && group.day === today;
  const empty = group.tasks.length === 0 && meetings.length === 0;

  return (
    <section aria-label={title}>
      <h2 className="mb-1 flex items-baseline gap-2 border-b border-border pb-2 pl-2">
        <span
          className={cn(
            "text-sm font-semibold",
            group.kind === "overdue" && "text-[#ff8a80]",
            isToday && "text-primary",
          )}
        >
          {title}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {group.tasks.length > 0 && (
          <span className="ml-auto pr-2 text-xs tabular-nums text-muted-foreground">{group.tasks.length}</span>
        )}
      </h2>
      <ul className="space-y-1.5">
        {meetings.map((m) => (
          <MeetingItem key={m.id} meeting={m} />
        ))}
        {group.tasks.map((t) => (
          <TaskItem key={t.id} task={t} showDate={group.kind === "overdue" || group.kind === "later"} />
        ))}
      </ul>
      {empty && <p className="px-2 pt-1 text-xs text-muted-foreground/70">Nothing planned</p>}
      {group.kind !== "overdue" && group.kind !== "later" && <InlineAdd day={group.day} />}
    </section>
  );
}

function doneHeading(day: Day, today: Day) {
  const label = dayLabel(day, today);
  return label === "Today" || label === "Yesterday" ? `Done ${label.toLowerCase()}` : `Done ${label}`;
}

function CompletedList({ timezone, tasks }: { timezone: string; tasks: Task[] }) {
  const { today } = useSchedule();
  const byDay = useMemo(() => {
    const done = tasks
      .filter((t) => t.completed_at)
      .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!));
    const out = new Map<Day, typeof done>();
    for (const t of done) {
      const day = dayInZone(t.completed_at!, timezone);
      out.set(day, [...(out.get(day) ?? []), t]);
    }
    return [...out.entries()];
  }, [tasks, timezone]);

  if (byDay.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        Finished to-dos will show here.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {byDay.map(([day, list]) => (
        <section key={day} aria-label={doneHeading(day, today)}>
          <h2 className="mb-1 flex items-baseline gap-2 border-b border-border pb-2 pl-2">
            <span className="text-sm font-semibold">{doneHeading(day, today)}</span>
            <span className="ml-auto pr-2 text-xs tabular-nums text-muted-foreground">{list.length}</span>
          </h2>
          <ul className="space-y-1.5">
            {list.map((t) => (
              <TaskItem key={t.id} task={t} showDate />
            ))}
          </ul>
        </section>
      ))}
      <p className="text-center text-xs text-muted-foreground">Shows the last 100 finished to-dos.</p>
    </div>
  );
}
