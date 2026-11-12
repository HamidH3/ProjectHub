import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { getProjectTaskBoard, toProjectLite } from "@/lib/tasks";
import { todayIn } from "@/lib/dates";
import { ScheduleProvider } from "@/components/tasks/schedule-context";
import { ScheduleDialogs } from "@/components/tasks/schedule-dialogs";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ params }: PageProps<"/projects/[projectId]/tasks">) {
  const { projectId } = await params;
  const [user, project] = await Promise.all([getCurrentUser(), getProject(projectId)]);
  const today = todayIn(user.timezone);
  const { tasks, meetings } = await getProjectTaskBoard(project.id, today);

  return (
    <ScheduleProvider
      today={today}
      projects={[toProjectLite(project)]}
      fixedProjectId={project.id}
      initialTasks={tasks}
      initialMeetings={meetings}
    >
      <TasksView timezone={user.timezone} calendarHref={`/projects/${project.id}/calendar`} />
      <ScheduleDialogs />
    </ScheduleProvider>
  );
}
