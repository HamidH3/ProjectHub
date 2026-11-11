"use client";

// Asks you to type the project's name before deleting it for good.
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteProject } from "@/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close(next: boolean) {
    if (!next) {
      setTyped("");
      setError(null);
    }
    onOpenChange(next);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(project.id, typed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close(false);
      toast.success(`Deleted "${project.name}"`);
      if (pathname.startsWith(`/projects/${project.id}`)) router.push("/");
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this project?</DialogTitle>
          <DialogDescription>
            This permanently deletes <span className="font-medium text-foreground">{project.name}</span> with all its
            notes, to-dos and uploaded files. It can&apos;t be undone. To hide it but keep everything, archive it instead.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-name">
            Type <span className="font-mono text-foreground">{project.name}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => close(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} disabled={pending || typed.trim() !== project.name}>
            {pending ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
