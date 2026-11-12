// What the home page shows. The page (app/(app)/page.tsx) loads the data and
// passes it in; keeping display separate makes it easy to change the layout.
import Link from "next/link";
import type { ProjectCardData } from "@/lib/projects";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectCard } from "@/components/home/project-card";

export type HomeViewProps = {
  firstName: string;
  partOfDay: string;
  todayHeading: string;
  isAdmin: boolean;
  projects: ProjectCardData[];
  archivedCount: number;
  showArchived: boolean;
  today: React.ReactNode; // the sticky notes (they need the browser, so the page passes them in)
};

export function HomeView({
  firstName,
  partOfDay,
  todayHeading,
  isAdmin,
  projects,
  archivedCount,
  showArchived,
  today,
}: HomeViewProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-12 sm:px-8 lg:pt-20">
      {/* Greeting */}
      <section className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Good {partOfDay}, {firstName}.
        </h1>
        <p className="mt-3 text-muted-foreground">Your workspace. Your projects. Everything in one place.</p>
        {isAdmin && (
          <div className="mt-8 flex justify-center">
            <NewProjectButton variant="hero" />
          </div>
        )}
      </section>

      {/* Projects */}
      <section className="mt-16" aria-labelledby="projects-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="projects-heading" className="text-xs font-semibold tracking-wider text-muted-foreground">
            YOUR PROJECTS
          </h2>
          {archivedCount > 0 && (
            <Link
              href={showArchived ? "/" : "/?archived=1"}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </Link>
          )}
        </div>

        {projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? "Start your first project and it will appear here and in the sidebar."
                : "When an administrator adds you to a project, it will appear here."}
            </p>
          </div>
        )}
      </section>

      {/* Today */}
      <section className="mt-16" aria-labelledby="today-heading">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="today-heading" className="text-xs font-semibold tracking-wider text-muted-foreground">
            TODAY · {todayHeading}
          </h2>
          <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            Plan the week
          </Link>
        </div>
        {today}
      </section>
    </div>
  );
}
