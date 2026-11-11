import type { Metadata } from "next";
import { ComingSoon } from "@/components/projects/coming-soon";

export const metadata: Metadata = { title: "Files" };

export default function FilesPage() {
  return (
    <ComingSoon
      title="Files"
      description="Upload, preview, rename and download project documents, stored privately in Supabase."
    />
  );
}
