"use client";

// A button that opens the New project form. Three looks: the big button on
// the home page, the sidebar button, and an icon-only button for the
// collapsed sidebar.
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";

export function NewProjectButton({
  variant = "sidebar",
  className,
}: {
  variant?: "hero" | "sidebar" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "hero" ? (
        <Button size="lg" onClick={() => setOpen(true)} className={cn("h-11 gap-2 rounded-full px-6 text-base", className)}>
          <Plus className="size-5" /> Start new project
        </Button>
      ) : variant === "icon" ? (
        <Button
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="New project"
          title="New project"
          className={cn("size-9", className)}
        >
          <Plus className="size-4" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} className={cn("w-full justify-start gap-2", className)}>
          <Plus className="size-4" /> New project
        </Button>
      )}
      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
