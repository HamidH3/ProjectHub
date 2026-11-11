import type { Metadata } from "next";
import { getProject, getProjectOverview } from "@/lib/projects";
import { formatDate } from "@/lib/dates";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/project-colors";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project.name };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// The Overview tab: where the project stands at a glance.
export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const overview = await getProjectOverview(project.id);
  const total = overview.openTasks + overview.doneTasks;
  const percent = total ? Math.round((overview.doneTasks / total) * 100) : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        <section aria-labelledby="progress-heading" className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 id="progress-heading" className="font-medium">
              Progress
            </h2>
            <span className="text-sm text-muted-foreground">
              {total ? `${overview.doneTasks} of ${total} to-dos done` : "No to-dos yet"}
            </span>
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Completed to-dos"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-right text-sm font-medium tabular-nums">{percent}%</p>
        </section>

        <section aria-label="Counts" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Notes" value={overview.notes} />
          <Stat label="Files" value={overview.files} />
          <Stat label="To-dos open" value={overview.openTasks} />
          <Stat label="To-dos done" value={overview.doneTasks} />
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium">Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{PROJECT_STATUSES[project.status as ProjectStatus]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{formatDate(project.start_date) ?? "Not set"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Deadline</dt>
              <dd>{formatDate(project.deadline) ?? "Not set"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(project.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium">Collaborators</h2>
          {overview.members.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {overview.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{m.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Only administrators so far. Invited people will show here.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
