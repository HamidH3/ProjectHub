"use server";

// Server actions for projects. Only admins can create, edit, archive or delete
// projects: these actions check that up front for a clear message, and the
// database rules enforce it again regardless.
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/audit";
import { projectIdSchema, projectSchema } from "@/lib/validation/project";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const NOT_ALLOWED: Result = { ok: false, error: "Only an administrator can do that." };

function refreshEverywhere() {
  // The sidebar, home page and project pages all show project details.
  revalidatePath("/", "layout");
}

export async function createProject(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return NOT_ALLOWED;

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").insert(parsed.data).select("id, name").single();
  if (error || !data) return { ok: false, error: "Couldn't create the project. Try again." };

  await logActivity({
    actorId: user.id,
    action: "project.created",
    projectId: data.id,
    entityType: "project",
    entityId: data.id,
    metadata: { name: data.name },
  });
  refreshEverywhere();
  return { ok: true, id: data.id };
}

export async function updateProject(projectId: string, formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return NOT_ALLOWED;
  if (!projectIdSchema.safeParse(projectId).success) return { ok: false, error: "Unknown project." };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save the changes. Try again." };

  await logActivity({
    actorId: user.id,
    action: "project.updated",
    projectId,
    entityType: "project",
    entityId: projectId,
    metadata: { name: parsed.data.name },
  });
  refreshEverywhere();
  return { ok: true, id: projectId };
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<Result> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return NOT_ALLOWED;
  if (!projectIdSchema.safeParse(projectId).success) return { ok: false, error: "Unknown project." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't update the project. Try again." };

  await logActivity({
    actorId: user.id,
    action: archived ? "project.archived" : "project.restored",
    projectId,
    entityType: "project",
    entityId: projectId,
  });
  refreshEverywhere();
  return { ok: true, id: projectId };
}

// Deletes the project's stored files first, then the project itself (its
// notes, to-dos, file records and members go with it). Activity history stays.
export async function deleteProject(projectId: string, confirmName: string): Promise<Result> {
  const user = await getCurrentUser();
  if (user.role !== "admin") return NOT_ALLOWED;
  if (!projectIdSchema.safeParse(projectId).success) return { ok: false, error: "Unknown project." };

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, error: "That project no longer exists." };
  if (confirmName.trim() !== project.name) {
    return { ok: false, error: "Type the project name exactly to confirm." };
  }

  // Remove stored files. Uses the secret key because a project folder may
  // hold files whose records were already removed; the admin check above
  // has already passed.
  const admin = createAdminClient();
  const bucket = admin.storage.from("project-files");
  const paths = new Set<string>();
  const { data: records } = await admin.from("files").select("storage_path").eq("project_id", projectId);
  records?.forEach((r) => paths.add(r.storage_path));
  const { data: listed } = await bucket.list(projectId, { limit: 1000 });
  listed?.forEach((o) => paths.add(`${projectId}/${o.name}`));
  const all = [...paths];
  for (let i = 0; i < all.length; i += 1000) {
    const { error } = await bucket.remove(all.slice(i, i + 1000));
    if (error) return { ok: false, error: "Couldn't delete the project's files, so nothing was deleted. Try again." };
  }

  const { data: deleted, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id")
    .maybeSingle();
  if (error || !deleted) return { ok: false, error: "Couldn't delete the project. Try again." };

  await logActivity({
    actorId: user.id,
    action: "project.deleted",
    projectId,
    entityType: "project",
    entityId: projectId,
    metadata: { name: project.name, files_removed: all.length },
  });
  refreshEverywhere();
  return { ok: true };
}

// Remembers that you opened a project, for "recently opened" on the home page.
export async function recordProjectView(projectId: string): Promise<void> {
  if (!projectIdSchema.safeParse(projectId).success) return;
  const user = await getCurrentUser();
  const supabase = await createClient();
  await supabase
    .from("project_views")
    .upsert(
      { user_id: user.id, project_id: projectId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,project_id" },
    );
}
