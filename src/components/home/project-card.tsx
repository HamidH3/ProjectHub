import Link from "next/link";
import type { ProjectCardData } from "@/lib/projects";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/project-colors";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ProjectDot } from "@/components/projects/project-dot";

// One project on the home page grid.
export function ProjectCard({ project }: { project: ProjectCardData }) {
  const deadline = formatDate(project.deadline);
  const percent = project.total ? Math.round((project.done / project.total) * 100) : 0;

  const counts: string[] = [];
  if (project.openToday) counts.push(`${project.openToday} today`);
  if (project.overdue) counts.push(`${project.overdue} overdue`);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 outline-none transition hover:border-foreground/20 hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2.5">
        <ProjectDot color={project.color} className="size-3" />
        <h3 className="truncate font-medium">{project.name}</h3>
      </div>

      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {project.description || "No description"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {PROJECT_STATUSES[project.status as ProjectStatus]}
        </span>
        {project.archived_at && <span className="rounded-full border border-border px-2 py-0.5">Archived</span>}
        {deadline && <span>Due {deadline}</span>}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs">
          <span className={cn(project.overdue ? "text-red-300" : "text-foreground/80")}>
            {counts.length ? counts.join(" · ") : "Nothing due today"}
          </span>
          <span className="text-muted-foreground">{project.total ? `${percent}%` : ""}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </Link>
  );
}
