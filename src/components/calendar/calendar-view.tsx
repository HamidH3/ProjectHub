"use client";

// A month calendar of to-dos and meetings. Click a day to see everything on
// it (and add to it) in the panel beside the calendar.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WEEKDAYS_SHORT,
  dayLong,
  monthLabel,
  monthOf,
  shiftMonth,
  shortTime,
  type Day,
  type Month,
} from "@/lib/days";
import { colorOf } from "@/lib/project-colors";
import { compareMeetings, compareTasks, type Meeting, type Task } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";
import { InlineAdd } from "@/components/tasks/quick-add";
import { MeetingItem, TaskItem } from "@/components/tasks/task-item";

const SHOWN_PER_DAY = 3;

export function CalendarView({ month, days, basePath }: { month: Month; days: Day[]; basePath: string }) {
  const { today, tasks, meetings, fixedProjectId, projects, projectOf, setTaskDraft, setMeetingDraft } = useSchedule();
  const [selected, setSelected] = useState<Day>(monthOf(today) === month ? today : `${month}-01`);
  const multiProject = !fixedProjectId;

  // Everything on each day, in order.
  const byDay = useMemo(() => {
    const map = new Map<Day, { meetings: Meeting[]; tasks: Task[] }>();
    for (const d of days) map.set(d, { meetings: [], tasks: [] });
    for (const m of meetings) map.get(m.meeting_date)?.meetings.push(m);
    for (const t of tasks) if (t.scheduled_date) map.get(t.scheduled_date)?.tasks.push(t);
    for (const v of map.values()) {
      v.meetings.sort(compareMeetings);
      // Unfinished first, then finished.
      v.tasks.sort((a, b) => Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) || compareTasks(a, b));
    }
    return map;
  }, [days, meetings, tasks]);

  const href = (m: Month) => `${basePath}?month=${m}`;
  const picked = byDay.get(selected) ?? { meetings: [], tasks: [] };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label={monthLabel(month)} className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold tracking-tight">{monthLabel(month)}</h2>
          <Link
            href={href(monthOf(today))}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm transition hover:bg-accent"
          >
            Today
          </Link>
          <Link
            href={href(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="inline-flex size-8 items-center justify-center rounded-md border border-border transition hover:bg-accent"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={href(shiftMonth(month, 1))}
            aria-label="Next month"
            className="inline-flex size-8 items-center justify-center rounded-md border border-border transition hover:bg-accent"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-card text-center text-[11px] font-semibold tracking-wider text-muted-foreground">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="py-2">
                {d.toUpperCase()}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const items = byDay.get(day)!;
              const inMonth = monthOf(day) === month;
              const isToday = day === today;
              const isSelected = day === selected;
              const entries = [
                ...items.meetings.map((m) => ({ kind: "meeting" as const, m })),
                ...items.tasks.map((t) => ({ kind: "task" as const, t })),
              ];
              const extra = entries.length - SHOWN_PER_DAY;
              return (
                <div
                  key={day}
                  onClick={() => setSelected(day)}
                  className={cn(
                    "min-h-20 cursor-pointer border-border p-1.5 transition sm:min-h-28",
                    i % 7 !== 6 && "border-r",
                    i < days.length - 7 && "border-b",
                    inMonth ? "bg-background" : "bg-[#151515] text-muted-foreground",
                    isSelected ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/60" : "hover:bg-[#1a1a1a]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(day)}
                    aria-label={`${dayLong(day)}: ${items.meetings.length} meetings, ${items.tasks.length} to-dos`}
                    aria-pressed={isSelected}
                    className={cn(
                      "mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-primary font-semibold text-primary-foreground" : !inMonth && "text-muted-foreground/60",
                    )}
                  >
                    {Number(day.slice(8))}
                  </button>

                  {/* Small screens: just dots */}
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    {entries.slice(0, 4).map((e) => (
                      <span
                        key={e.kind === "meeting" ? e.m.id : e.t.id}
                        className={cn("size-1.5 rounded-full", e.kind === "task" && e.t.completed_at && "opacity-40")}
                        style={{
                          backgroundColor: colorOf(projectOf(e.kind === "meeting" ? e.m.project_id : e.t.project_id)?.color).dot,
                        }}
                      />
                    ))}
                  </div>

                  <ul className="hidden space-y-0.5 sm:block">
                    {entries.slice(0, SHOWN_PER_DAY).map((e) =>
                      e.kind === "meeting" ? (
                        <li key={e.m.id}>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelected(day);
                              setMeetingDraft({ meeting: e.m });
                            }}
                            className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-4 hover:bg-accent"
                            style={{ boxShadow: `inset 2px 0 0 ${colorOf(projectOf(e.m.project_id)?.color).dot}` }}
                          >
                            {e.m.start_time && (
                              <span className="shrink-0 tabular-nums text-muted-foreground">{shortTime(e.m.start_time)}</span>
                            )}
                            <span className="truncate">{e.m.title}</span>
                          </button>
                        </li>
                      ) : (
                        <li key={e.t.id}>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelected(day);
                              setTaskDraft({ task: e.t });
                            }}
                            className={cn(
                              "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-4 hover:bg-accent",
                              e.t.completed_at && "text-muted-foreground line-through",
                            )}
                          >
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full border"
                              style={{
                                borderColor: colorOf(projectOf(e.t.project_id)?.color).dot,
                                backgroundColor: e.t.completed_at ? colorOf(projectOf(e.t.project_id)?.color).dot : undefined,
                              }}
                            />
                            <span className="truncate">{e.t.title}</span>
                          </button>
                        </li>
                      ),
                    )}
                    {extra > 0 && <li className="px-1 text-[11px] text-muted-foreground">+{extra} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {multiProject && projects.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Project colours">
            {projects.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(p.color).dot }} />
                {p.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The chosen day */}
      <aside aria-label={dayLong(selected)} className="h-fit rounded-xl border border-border bg-card p-4 xl:sticky xl:top-4">
        <h3 className="font-medium">{dayLong(selected)}</h3>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setTaskDraft({ defaults: { scheduled_date: selected } })}
          >
            <Plus className="size-4" /> To-do
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setMeetingDraft({ defaults: { meeting_date: selected } })}
          >
            <Users className="size-4" /> Meeting
          </Button>
        </div>

        {picked.meetings.length === 0 && picked.tasks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nothing on this day yet.</p>
        ) : (
          <ul className="-mx-2 mt-3 space-y-0.5">
            {picked.meetings.map((m) => (
              <MeetingItem key={m.id} meeting={m} showProject={multiProject} />
            ))}
            {picked.tasks.map((t) => (
              <TaskItem key={t.id} task={t} showProject={multiProject} />
            ))}
          </ul>
        )}
        {fixedProjectId && (
          <div className="-mx-2 mt-1">
            <InlineAdd day={selected} />
          </div>
        )}
      </aside>
    </div>
  );
}
