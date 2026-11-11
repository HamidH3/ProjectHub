import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getHomeProjects } from "@/lib/projects";
import { partOfDay, todayHeading } from "@/lib/dates";
import { HomeView } from "@/components/home/home-view";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const showArchived = params.archived === "1";

  const all = await getHomeProjects(user.id, user.timezone);

  return (
    <HomeView
      firstName={user.fullName?.split(" ")[0] || user.username || "there"}
      partOfDay={partOfDay(user.timezone)}
      todayHeading={todayHeading(user.timezone)}
      isAdmin={user.role === "admin"}
      projects={showArchived ? all : all.filter((p) => !p.archived_at)}
      archivedCount={all.filter((p) => p.archived_at).length}
      showArchived={showArchived}
    />
  );
}
