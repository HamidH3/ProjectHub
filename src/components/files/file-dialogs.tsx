"use client";

// Dialogs for the Files tab: name a folder or file, move, delete, and a quick
// look at images.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, ExternalLink, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { extensionOf, FILE_NAME_MAX, FOLDER_NAME_MAX, type FileRow, type FolderRow } from "@/lib/file-types";
import { cn } from "@/lib/utils";
import { folderSubtree, useFiles } from "@/components/files/files-context";

export function fileHref(projectId: string, fileId: string, download = false) {
  return `/projects/${projectId}/files/${fileId}${download ? "?download=1" : ""}`;
}

export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  kind,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: string;
  kind: "folder" | "file";
  submitLabel: string;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the name but not the extension, like Windows does. (Waits a moment:
  // the dialog first selects the whole field when it opens.)
  useEffect(() => {
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const ext = kind === "file" ? extensionOf(input.value) : "";
      input.setSelectionRange(0, ext ? input.value.length - ext.length - 1 : input.value.length);
    }, 30);
    return () => clearTimeout(timer);
  }, [kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (await onSubmit(name)) onOpenChange(false);
            });
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">Type a name and press Enter.</DialogDescription>
          </DialogHeader>
          <Input
            ref={inputRef}
            aria-label={kind === "folder" ? "Folder name" : "File name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={kind === "folder" ? FOLDER_NAME_MAX : FILE_NAME_MAX}
            placeholder={kind === "folder" ? "e.g. Contracts" : undefined}
            required
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || name.trim() === initial}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveDialog({
  item,
  open,
  onOpenChange,
}: {
  item: { type: "file"; file: FileRow } | { type: "folder"; folder: FolderRow };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { folders, moveFile, moveFolder } = useFiles();
  const current = item.type === "file" ? item.file.folder_id : item.folder.parent_id;
  const [target, setTarget] = useState<string>(current ?? "top");
  const [pending, startTransition] = useTransition();
  const name = item.type === "file" ? item.file.name : item.folder.name;

  // Every folder it could go in (a folder can't go inside itself).
  const options = useMemo(() => {
    const blocked = item.type === "folder" ? folderSubtree(folders, item.folder.id) : new Set<string>();
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const f of folders.filter((x) => x.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
        if (blocked.has(f.id)) continue;
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders, item]);

  const chosen = target === "top" ? null : target;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{name}”</DialogTitle>
          <DialogDescription>Choose a folder.{item.type === "folder" ? " Everything inside moves with it." : ""}</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="Destination">
          {[{ id: "top", name: "Files (top level)", depth: 0 }, ...options].map((o) => (
            <label
              key={o.id}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent", target === o.id && "bg-accent")}
              style={{ paddingLeft: 12 + o.depth * 16 }}
            >
              <input
                type="radio"
                name="move-target"
                value={o.id}
                checked={target === o.id}
                onChange={() => setTarget(o.id)}
                className="accent-[var(--primary)]"
              />
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{o.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || chosen === current}
            onClick={() =>
              startTransition(async () => {
                const ok = item.type === "file" ? await moveFile(item.file.id, chosen) : await moveFolder(item.folder.id, chosen);
                if (ok) onOpenChange(false);
              })
            }
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (await onConfirm()) onOpenChange(false);
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImagePreview({
  file,
  open,
  onOpenChange,
}: {
  file: FileRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const href = fileHref(file.project_id, file.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{file.name}</DialogTitle>
          <DialogDescription className="sr-only">Image preview</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-md bg-black/40">
          {/* The address sends you on to a private, short-lived link, so next/image can't be used here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />
        </div>
        <DialogFooter>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm transition hover:bg-accent"
          >
            <ExternalLink className="size-4" /> Open in new tab
          </a>
          <a
            href={fileHref(file.project_id, file.id, true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground transition hover:bg-primary/90"
          >
            <Download className="size-4" /> Download
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
