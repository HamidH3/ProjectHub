// Reading your meeting recordings, as you (the database only returns your own).
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { recallConfigured } from "@/lib/meetings/recall";
import { claudeConfigured } from "@/lib/meetings/summarise";

export type RecordingSummary = {
  id: string;
  title: string;
  meeting_url: string;
  status: string;
  status_detail: string | null;
  project_id: string | null;
  note_id: string | null;
  summary_title: string | null;
  created_at: string;
  ended_at: string | null;
  updated_at: string;
};

export async function getMyRecordings(): Promise<RecordingSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_recordings")
    .select("id, title, meeting_url, status, status_detail, project_id, note_id, summary_title, created_at, ended_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Couldn't load your meetings.");
  return data;
}

// Meetings whose summary is waiting for you to pick a project (for the badge).
export async function countWaitingForProject(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("meeting_recordings")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready")
    .is("project_id", null);
  return count ?? 0;
}

// Which settings are missing (names only, never values).
export function missingSettings(): string[] {
  const missing: string[] = [];
  if (!recallConfigured()) missing.push("RECALL_API_KEY / RECALL_REGION");
  if (!process.env.RECALL_WEBHOOK_SECRET?.startsWith("whsec_")) missing.push("RECALL_WEBHOOK_SECRET");
  if (!claudeConfigured()) missing.push("ANTHROPIC_API_KEY");
  return missing;
}
