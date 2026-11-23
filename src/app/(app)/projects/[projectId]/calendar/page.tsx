import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getCalendarMonth, getTeam, toProjectLite } from "@/lib/tasks";
import { todayIn } from "@/lib/dates";
import { isMonth, monthGrid, monthOf } from "@/lib/days";
import { getOutlook } from "@/lib/outlook/data";
import { OutlookProvider } from "@/components/outlook/outlook-context";
import { ScheduleProvider } from "@/components/tasks/schedule-context";
import { ScheduleDialogs } from "@/components/tasks/schedule-dialogs";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function ProjectCalendarPage({ params, searchParams }: PageProps<"/projects/[projectId]/calendar">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const [user, project, team] = await Promise.all([getCurrentUser(), getProject(projectId), getTeam()]);
  const today = todayIn(user.timezone);
  const month = isMonth(query.month) ? query.month : monthOf(today);
  const grid = monthGrid(month);
  const [{ days, tasks, meetings }, outlook] = await Promise.all([
    getCalendarMonth(month, project.id),
    // Your own Outlook meetings that you've linked to this project.
    getOutlook(user.timezone, { from: grid[0], to: grid[grid.length - 1], projectId: project.id }),
  ]);

  return (
    <ScheduleProvider
      today={today}
      team={team}
      meId={user.id}
      projects={[toProjectLite(project)]}
      fixedProjectId={project.id}
      initialTasks={tasks}
      initialMeetings={meetings}
    >
      <OutlookProvider
        events={outlook.events}
        connections={outlook.connections}
        projects={[toProjectLite(project)]}
        onlyProjectId={project.id}
      >
        <CalendarView key={month} month={month} days={days} basePath={`/projects/${project.id}/calendar`} />
      </OutlookProvider>
      <ScheduleDialogs />
    </ScheduleProvider>
  );
}
