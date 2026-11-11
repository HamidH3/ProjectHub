import type { Metadata } from "next";
import { ComingSoon } from "@/components/projects/coming-soon";

export const metadata: Metadata = { title: "Notes" };

export default function NotesPage() {
  return (
    <ComingSoon
      title="Notes"
      description="Pages and subpages with a rich-text editor and automatic saving. Built in the next feature step."
    />
  );
}
