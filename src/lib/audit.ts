import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type ActivityEntry = {
  actorId: string | null;
  action: string; // e.g. "auth.login", "project.created"
  projectId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Json;
};

// Writes to activity_logs. Only the server can write there (see migration 2),
// so entries can't be forged or edited from the browser.
// A failed log write is reported but never blocks the user's action.
export async function logActivity(entry: ActivityEntry) {
  const admin = createAdminClient();
  const { error } = await admin.from("activity_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    project_id: entry.projectId ?? null,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) console.error("Audit log write failed:", error.message);
}
