// Loading a project's folders and files. Uses the logged-in user's session,
// so the database only returns rows from projects they can open.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FILE_COLUMNS, FOLDER_COLUMNS, type FileRow, type FolderRow } from "@/lib/file-types";

export async function getProjectFiles(projectId: string) {
  const supabase = await createClient();
  const [files, folders] = await Promise.all([
    supabase.from("files").select(FILE_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("folders").select(FOLDER_COLUMNS).eq("project_id", projectId).order("name"),
  ]);
  if (files.error || folders.error) throw new Error("Couldn't load the files.");
  return { files: files.data as FileRow[], folders: folders.data as FolderRow[] };
}
