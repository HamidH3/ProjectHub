import type { Metadata } from "next";
import { getProject, getProjectOverview } from "@/lib/projects";

export const metadata: Metadata = { title: "Members" };

// For now this lists who has access. Inviting and removing people comes with
// the invitations step.
export default async function MembersPage({ params }: PageProps<"/projects/[projectId]/members">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const { members } = await getProjectOverview(project.id);

  return (
    <section className="max-w-2xl">
      <h2 className="font-medium">Who can access this project</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Administrators can see every project. The people below have also been given access.
      </p>
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        {members.length ? (
          members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                {m.username && <p className="truncate text-xs text-muted-foreground">@{m.username}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{m.role === "admin" ? "Administrator" : "Member"}</span>
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No one else has been added yet.</li>
        )}
      </ul>
    </section>
  );
}
