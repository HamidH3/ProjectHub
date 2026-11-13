"use client";

// The "New project" / "Edit details" form, shown in a dialog.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createProject, updateProject } from "@/actions/projects";
import type { Project } from "@/lib/projects";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES, PROJECT_STATUSES } from "@/lib/project-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project; // present = edit, absent = create
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(project);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = project ? await updateProject(project.id, formData) : await createProject(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      toast.success(editing ? "Project updated" : "Project created");
      if (!editing && result.id) router.push(`/projects/${result.id}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {editing ? "Change the project's details." : "Only the name is required. You can change everything later."}
          </DialogDescription>
        </DialogHeader>

        {/* key resets the fields each time the dialog opens */}
        <form key={open ? "open" : "closed"} onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-(--danger-soft)">
              {error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              name="name"
              defaultValue={project?.name}
              maxLength={120}
              placeholder="e.g. Website Development"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Short description</Label>
            <Textarea
              id="project-description"
              name="description"
              defaultValue={project?.description ?? ""}
              maxLength={2000}
              rows={2}
              placeholder="What is this project about?"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2.5">
              {PROJECT_COLOR_NAMES.map((name) => (
                <label key={name} className="cursor-pointer" title={PROJECT_COLORS[name].label}>
                  <input
                    type="radio"
                    name="color"
                    value={name}
                    defaultChecked={(project?.color ?? "orange") === name}
                    className="peer sr-only"
                  />
                  <span
                    className="block size-7 rounded-full ring-offset-2 ring-offset-card transition peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    style={{ backgroundColor: PROJECT_COLORS[name].dot }}
                  />
                  <span className="sr-only">{PROJECT_COLORS[name].label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-status">Status</Label>
              <select id="project-status" name="status" defaultValue={project?.status ?? "active"} className={selectClass}>
                {Object.entries(PROJECT_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Start date</Label>
              <Input id="project-start" name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-deadline">Deadline</Label>
              <Input id="project-deadline" name="deadline" type="date" defaultValue={project?.deadline ?? ""} />
            </div>
          </div>

          {!editing ? (
            <p className="text-xs text-muted-foreground">
              You can add collaborators from the project&apos;s Members tab once invites are set up.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
