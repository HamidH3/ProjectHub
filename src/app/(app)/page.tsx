import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getHomeProjects } from "@/lib/projects";
import { partOfDay, todayHeading, todayIn } from "@/lib/dates";
import { HomeView } from "@/components/home/home-view";
import { getTodayBoard, toProjectLite } from "@/lib/tasks";
import { ScheduleProvider } from "@/components/tasks/schedule-context";
import { ScheduleDialogs } from "@/components/tasks/schedule-dialogs";
import { TodayBoard } from "@/components/home/today-board";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const showArchived = params.archived === "1";

  const today = todayIn(user.timezone);
  const [all, board] = await Promise.all([getHomeProjects(user.id, user.timezone), getTodayBoard(today)]);

  // Sticky notes only for active projects, in the same order as the cards.
  const active = all.filter((p) => !p.archived_at);
  const activeIds = new Set(active.map((p) => p.id));

  return (
    <HomeView
      firstName={user.fullName?.split(" ")[0] || user.username || "there"}
      partOfDay={partOfDay(user.timezone)}
      todayHeading={todayHeading(user.timezone)}
      isAdmin={user.role === "admin"}
      projects={showArchived ? all : all.filter((p) => !p.archived_at)}
      archivedCount={all.filter((p) => p.archived_at).length}
      showArchived={showArchived}
      today={
        <ScheduleProvider
          today={today}
          projects={active.map(toProjectLite)}
          initialTasks={board.tasks.filter((t) => activeIds.has(t.project_id))}
          initialMeetings={board.meetings.filter((m) => activeIds.has(m.project_id))}
        >
          <TodayBoard />
          <ScheduleDialogs />
        </ScheduleProvider>
      }
    />
  );
}
