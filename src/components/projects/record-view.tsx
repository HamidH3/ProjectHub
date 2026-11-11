"use client";

// Tells the server you opened this project (for "recently opened").
// Runs after the page shows, so it never slows anything down.
import { useEffect } from "react";
import { recordProjectView } from "@/actions/projects";

export function RecordView({ projectId }: { projectId: string }) {
  useEffect(() => {
    recordProjectView(projectId).catch(() => {});
  }, [projectId]);
  return null;
}
