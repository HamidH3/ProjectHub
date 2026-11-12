import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getCalendarMonth, toProjectLite } from "@/lib/tasks";
import { todayIn } from "@/lib/dates";
import { isMonth, monthOf } from "@/lib/days";
import { ScheduleProvider } from "@/components/tasks/schedule-context";
import { ScheduleDialogs } from "@/components/tasks/schedule-dialogs";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function ProjectCalendarPage({ params, searchParams }: PageProps<"/projects/[projectId]/calendar">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const [user, project] = await Promise.all([getCurrentUser(), getProject(projectId)]);
  const today = todayIn(user.timezone);
  const month = isMonth(query.month) ? query.month : monthOf(today);
  const { days, tasks, meetings } = await getCalendarMonth(month, project.id);

  return (
    <ScheduleProvider
      today={today}
      projects={[toProjectLite(project)]}
      fixedProjectId={project.id}
      initialTasks={tasks}
      initialMeetings={meetings}
    >
      <CalendarView key={month} month={month} days={days} basePath={`/projects/${project.id}/calendar`} />
      <ScheduleDialogs />
    </ScheduleProvider>
  );
}
