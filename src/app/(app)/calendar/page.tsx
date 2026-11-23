import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSidebarProjects } from "@/lib/projects";
import { getCalendarMonth, getTeam, toProjectLite } from "@/lib/tasks";
import { todayIn } from "@/lib/dates";
import { isMonth, monthGrid, monthOf } from "@/lib/days";
import { getOutlook } from "@/lib/outlook/data";
import { OutlookProvider } from "@/components/outlook/outlook-context";
import { ScheduleProvider } from "@/components/tasks/schedule-context";
import { ScheduleDialogs } from "@/components/tasks/schedule-dialogs";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

// Every project's to-dos and meetings on one calendar, plus your own Outlook
// meetings if you've connected Outlook (Settings).
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const query = await searchParams;
  const [user, projects, team] = await Promise.all([getCurrentUser(), getSidebarProjects(), getTeam()]);
  const today = todayIn(user.timezone);
  const month = isMonth(query.month) ? query.month : monthOf(today);
  const grid = monthGrid(month);
  const [{ days, tasks, meetings }, outlook] = await Promise.all([
    getCalendarMonth(month),
    getOutlook(user.timezone, { from: grid[0], to: grid[grid.length - 1] }),
  ]);

  // Only active projects (archived ones are hidden, like in the sidebar).
  const active = new Set(projects.map((p) => p.id));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          To-dos and meetings from all your projects{outlook.connections.length > 0 ? ", and your Outlook calendar" : ""}.
        </p>
      </header>
      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Your calendar fills up once you have a project. <Link href="/" className="text-primary hover:underline">Go home</Link>
        </div>
      ) : (
        <ScheduleProvider
          today={today}
          team={team}
          meId={user.id}
          projects={projects.map(toProjectLite)}
          initialTasks={tasks.filter((t) => active.has(t.project_id))}
          initialMeetings={meetings.filter((m) => active.has(m.project_id))}
        >
          <OutlookProvider events={outlook.events} connections={outlook.connections} projects={projects.map(toProjectLite)}>
            <CalendarView key={month} month={month} days={days} basePath="/calendar" />
          </OutlookProvider>
          <ScheduleDialogs />
        </ScheduleProvider>
      )}
    </div>
  );
}
