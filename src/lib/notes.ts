// Reading notes on the server, as the logged-in user (security rules apply).
import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectIdSchema } from "@/lib/validation/project";
import type { NoteSummary } from "@/lib/note-tree";
import type { Json } from "@/types/database";

export const NOTE_SUMMARY_COLUMNS = "id, parent_id, title, preview, position, updated_at, created_at, created_by";

// Every note in a project, without the full content (for the notes list).
export async function getNoteSummaries(projectId: string): Promise<NoteSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SUMMARY_COLUMNS)
    .eq("project_id", projectId);
  if (error) throw new Error("Couldn't load the notes.");
  return data;
}

export type FullNote = {
  id: string;
  project_id: string;
  title: string;
  content: Json;
  updated_at: string;
  created_by: string | null;
  drawing: Json;
};

// One note with its content, or a 404.
export async function getNote(projectId: string, noteId: string): Promise<FullNote> {
  if (!projectIdSchema.safeParse(noteId).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, project_id, title, content, updated_at, created_by, drawing")
    .eq("id", noteId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) notFound();
  return data;
}
