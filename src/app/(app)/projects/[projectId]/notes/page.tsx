import type { Metadata } from "next";
import { NotesEmptyState } from "@/components/notes/notes-empty-state";

export const metadata: Metadata = { title: "Notes" };

// Shown beside the list when no note is open.
export default function NotesIndexPage() {
  return <NotesEmptyState />;
}
