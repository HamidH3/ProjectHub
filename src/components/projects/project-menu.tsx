"use client";

// The three-dot menu beside a project: Edit details, Archive/Restore, Delete.
// Only shown to admins (the server checks again for every action).
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { setProjectArchived } from "@/actions/projects";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";

export function ProjectMenu({ project, className }: { project: Project; className?: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [, startTransition] = useTransition();
  const archived = Boolean(project.archived_at);

  function toggleArchive() {
    startTransition(async () => {
      const result = await setProjectArchived(project.id, !archived);
      if (!result.ok) toast.error(result.error);
      else toast.success(archived ? "Project restored" : "Project archived");
    });
  }

  return (
    <>
      {/* modal={false} avoids a known Radix issue when a menu item opens a dialog */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={`Options for ${project.name}`}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleArchive}>
            {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <DeleteProjectDialog open={deleteOpen} onOpenChange={setDeleteOpen} project={project} />
    </>
  );
}
