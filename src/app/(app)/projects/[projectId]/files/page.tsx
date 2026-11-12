import type { Metadata } from "next";
import { getProject } from "@/lib/projects";
import { getProjectFiles } from "@/lib/files";
import { FilesProvider } from "@/components/files/files-context";
import { FilesView } from "@/components/files/files-view";

export const metadata: Metadata = { title: "Files" };

export default async function FilesPage({ params }: PageProps<"/projects/[projectId]/files">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  const { files, folders } = await getProjectFiles(project.id);

  return (
    <FilesProvider projectId={project.id} initialFiles={files} initialFolders={folders}>
      <FilesView />
    </FilesProvider>
  );
}
