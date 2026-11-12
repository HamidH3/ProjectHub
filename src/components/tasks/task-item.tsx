"use client";

// One to-do in a list: tick box, name, and a line of details (who it's for,
// time, priority, day, project). Open to-dos sit on a card tinted with the
// project's colour so they stand out; finished ones go plain and grey.
// Click the name to edit; the ⋯ menu has quick moves.
import { Check, Clock, MapPin, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays, dayLabel, shortTime } from "@/lib/days";
import { colorOf } from "@/lib/project-colors";
import { PRIORITIES, type Meeting, type Task } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";
import { AssigneeBadge } from "@/components/tasks/assignee";

export function TaskCheckbox({ task, className }: { task: Task; className?: string }) {
  const { toggleTask } = useSchedule();
  const done = Boolean(task.completed_at);
  const color = task.priority ? PRIORITIES[task.priority].color : undefined;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      onClick={() => void toggleTask(task.id)}
      className={cn(
        "group/check flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition",
        done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/60 hover:border-primary",
        className,
      )}
      style={!done && color ? { borderColor: color } : undefined}
    >
      <Check
        strokeWidth={3}
        className={cn("size-3 transition", done ? "opacity-100" : "opacity-0 group-hover/check:opacity-50")}
      />
    </button>
  );
}

export function TaskItem({
  task,
  showDate = false,
  showProject = false,
}: {
  task: Task;
  showDate?: boolean;
  showProject?: boolean;
}) {
  const { today, projectOf, updateTask, deleteTask, setTaskDraft } = useSchedule();
  const done = Boolean(task.completed_at);
  const ownProject = projectOf(task.project_id);
  const project = showProject ? ownProject : undefined;
  const tint = colorOf(ownProject?.color).dot;
  const overdue = !done && task.scheduled_date !== null && task.scheduled_date < today;
  const time = shortTime(task.due_time);

  const details = [
    task.assignee_id && <AssigneeBadge key="for" assigneeId={task.assignee_id} />,
    showDate && task.scheduled_date && (
      <span key="date" className={cn(overdue && "text-[#ff8a80]")}>
        {dayLabel(task.scheduled_date, today)}
      </span>
    ),
    time && (
      <span key="time" className="inline-flex items-center gap-1">
        <Clock className="size-3" />
        {time}
      </span>
    ),
    task.priority && (
      <span key="priority" className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: PRIORITIES[task.priority].color }} />
        {PRIORITIES[task.priority].label}
      </span>
    ),
    project && (
      <span key="project" className="inline-flex min-w-0 items-center gap-1">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(project.color).dot }} />
        <span className="truncate">{project.name}</span>
      </span>
    ),
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg transition",
        done
          ? "px-2 py-2 hover:bg-[#1f1f1f]"
          : "border border-white/[0.1] border-l-4 px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.35)] hover:brightness-110",
      )}
      style={done ? undefined : { backgroundColor: `color-mix(in srgb, ${tint} 26%, #262626)`, borderLeftColor: tint }}
    >
      <TaskCheckbox task={task} className="mt-0.5" />
      <button
        type="button"
        onClick={() => setTaskDraft({ task })}
        className="min-w-0 flex-1 text-left outline-none focus-visible:underline"
      >
        <span
          className={cn(
            "block text-sm leading-5 [overflow-wrap:anywhere]",
            done ? "text-muted-foreground line-through" : "font-medium text-[#f5f5f5]",
          )}
        >
          {task.title}
        </span>
        {task.description && !done && (
          <span className="mt-0.5 block truncate text-xs text-[#c9c9c9]">{task.description}</span>
        )}
        {details.length > 0 && (
          <span
            className={cn(
              "mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
              done ? "text-muted-foreground" : "text-[#c9c9c9]",
            )}
          >
            {details}
          </span>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More options for ${task.title}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setTaskDraft({ task })}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          {!done && task.scheduled_date !== today && (
            <DropdownMenuItem onSelect={() => void updateTask(task.id, { scheduled_date: today })}>
              Move to today
            </DropdownMenuItem>
          )}
          {!done && (
            <DropdownMenuItem
              onSelect={() =>
                void updateTask(task.id, {
                  scheduled_date: addDays(task.scheduled_date && task.scheduled_date >= today ? task.scheduled_date : today, 1),
                })
              }
            >
              {task.scheduled_date && task.scheduled_date > today ? "Push back a day" : "Move to tomorrow"}
            </DropdownMenuItem>
          )}
          {!done && task.scheduled_date && (
            <DropdownMenuItem onSelect={() => void updateTask(task.id, { scheduled_date: null })}>
              Remove day
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteTask(task.id)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// A meeting shown in a list: time, name and place. Click to edit.
export function MeetingItem({ meeting, showProject = false }: { meeting: Meeting; showProject?: boolean }) {
  const { projectOf, setMeetingDraft } = useSchedule();
  const project = projectOf(meeting.project_id);
  const from = shortTime(meeting.start_time);
  const to = shortTime(meeting.end_time);
  return (
    <li>
      <button
        type="button"
        onClick={() => setMeetingDraft({ meeting })}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[#1f1f1f]"
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[#111]"
          style={{ backgroundColor: colorOf(project?.color).dot }}
        >
          <Users className="size-3" strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-5 [overflow-wrap:anywhere]">{meeting.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {from ? (to ? `${from} – ${to}` : from) : "All day"}
            </span>
            {meeting.location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{meeting.location}</span>
              </span>
            )}
            {showProject && project && <span className="truncate">{project.name}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
