import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/project-colors";
import { ProjectDot } from "@/components/projects/project-dot";
import { ProjectMenu } from "@/components/projects/project-menu";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { RecordView } from "@/components/projects/record-view";

// The header (name, description, tabs) shared by every tab of a project.
export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const [user, project] = await Promise.all([getCurrentUser(), getProject(projectId)]);

  return (
    <div className="flex min-h-full flex-col">
      <RecordView projectId={project.id} />
      <header className="border-b border-border px-5 pt-8 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-start gap-3">
            <ProjectDot color={project.color} className="mt-2.5 size-3.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  {PROJECT_STATUSES[project.status as ProjectStatus]}
                </span>
                {project.archived_at && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Archived
                  </span>
                )}
              </div>
              {project.description && (
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
            {(user.role === "admin" || project.created_by === user.id) && (
              <ProjectMenu project={project} canDelete={user.role === "admin"} />
            )}
          </div>
          <div className="mt-6">
            <ProjectTabs projectId={project.id} />
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</div>
    </div>
  );
}
