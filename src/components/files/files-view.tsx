"use client";

// The Files tab: folders and files for a project. Upload with the button or
// by dropping files anywhere on the page; drag a file or folder onto a folder
// (or onto the path at the top) to move it.
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Presentation,
  Search,
  Trash2,
  Upload as UploadIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/dates";
import {
  ACCEPT,
  ALLOWED_LABEL,
  formatBytes,
  kindOf,
  opensInBrowser,
  type FileKind,
  type FileRow,
  type FolderRow,
} from "@/lib/file-types";
import { cn } from "@/lib/utils";
import { folderSubtree, useFiles } from "@/components/files/files-context";
import { ConfirmDeleteDialog, fileHref, ImagePreview, MoveDialog, NameDialog } from "@/components/files/file-dialogs";

const DRAG_TYPE = "application/x-projecthub-item";
type DragItem = { type: "file" | "folder"; id: string };
type Sort = "name" | "newest" | "size";

const KIND_ICON: Record<FileKind, { icon: typeof FileIcon; color: string }> = {
  pdf: { icon: FileText, color: "#e5484d" },
  doc: { icon: FileText, color: "#6aa4f0" },
  sheet: { icon: FileSpreadsheet, color: "#5fc9a0" },
  slides: { icon: Presentation, color: "#d97757" },
  text: { icon: FileText, color: "#9a9a9a" },
  image: { icon: FileImage, color: "#a891f0" },
  zip: { icon: FileArchive, color: "#e5b94e" },
};

function readDrag(e: React.DragEvent): DragItem | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragItem) : null;
  } catch {
    return null;
  }
}

const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
const hasItem = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

export function FilesView() {
  const { files, folders, uploadFiles, createFolder, moveFile, moveFolder } = useFiles();
  const params = useSearchParams();
  const wanted = params.get("folder");
  const currentId = wanted && folders.some((f) => f.id === wanted) ? wanted : null;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening a folder changes the address (so Back works) without reloading.
  const open = (id: string | null) => {
    setQuery("");
    window.history.pushState(null, "", id ? `?folder=${id}` : window.location.pathname);
  };

  // The path from the top to the current folder.
  const trail = useMemo(() => {
    const out: FolderRow[] = [];
    let id = currentId;
    while (id) {
      const f = folders.find((x) => x.id === id);
      if (!f) break;
      out.unshift(f);
      id = f.parent_id;
    }
    return out;
  }, [currentId, folders]);

  const pathOf = (folderId: string | null) => {
    const names: string[] = [];
    let id = folderId;
    while (id) {
      const f = folders.find((x) => x.id === id);
      if (!f) break;
      names.unshift(f.name);
      id = f.parent_id;
    }
    return names.length ? `Files / ${names.join(" / ")}` : "Files";
  };

  const q = query.trim().toLowerCase();
  const shownFolders = (q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders.filter((f) => f.parent_id === currentId))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const shownFiles = (q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files.filter((f) => f.folder_id === currentId))
    .slice()
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : b.size_bytes - a.size_bytes,
    );

  const totalBytes = files.reduce((sum, f) => sum + f.size_bytes, 0);
  const here = currentId ? trail.at(-1)?.name : "Files";

  async function dropOn(folderId: string | null, e: React.DragEvent) {
    const item = readDrag(e);
    if (!item) return;
    if (item.type === "file") await moveFile(item.id, folderId);
    else if (item.id !== folderId) await moveFolder(item.id, folderId);
  }

  return (
    <div
      className="relative space-y-4"
      // Dropping files from your computer anywhere here uploads them to the open folder.
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        void uploadFiles(Array.from(e.dataTransfer.files), currentId);
      }}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground focus-within:border-ring sm:max-w-xs">
          <Search className="size-4 shrink-0" />
          <span className="sr-only">Search files in this project</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this project's files"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <select
          aria-label="Sort files"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border border-border bg-card px-2.5 text-sm outline-none focus-visible:border-ring"
        >
          <option value="name">Name</option>
          <option value="newest">Newest first</option>
          <option value="size">Largest first</option>
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="size-4" /> New folder
          </Button>
          <Button onClick={() => inputRef.current?.click()}>
            <UploadIcon className="size-4" /> Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              void uploadFiles(Array.from(e.target.files ?? []), currentId);
              e.target.value = ""; // so the same file can be chosen again
            }}
          />
        </div>
      </div>

      {/* Where you are */}
      {!q && (
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-0.5 text-sm">
          {[{ id: null as string | null, name: "Files" }, ...trail].map((f, i, all) => {
            const last = i === all.length - 1;
            return (
              <span key={f.id ?? "top"} className="flex items-center gap-0.5">
                {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
                <DropTarget onDropItem={(e) => dropOn(f.id, e)} disabled={last}>
                  {(over) => (
                    <button
                      type="button"
                      onClick={() => !last && open(f.id)}
                      aria-current={last ? "page" : undefined}
                      className={cn(
                        "rounded-md px-1.5 py-1 transition",
                        last ? "font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        over && "bg-primary/15 text-foreground ring-1 ring-primary",
                      )}
                    >
                      {f.name}
                    </button>
                  )}
                </DropTarget>
              </span>
            );
          })}
        </nav>
      )}

      {/* The list */}
      {shownFolders.length + shownFiles.length === 0 ? (
        q ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center transition hover:border-primary/60"
          >
            <UploadIcon className="size-6 text-muted-foreground" />
            <span className="font-medium">{currentId ? "This folder is empty" : "No files yet"}</span>
            <span className="max-w-md text-sm text-muted-foreground">
              Drop files here or click to choose. {ALLOWED_LABEL}, up to 50 MB each.
            </span>
          </button>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_96px_120px_40px] gap-3 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Name</span>
            <span>Size</span>
            <span>Added</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {shownFolders.map((f) => (
              <FolderItem
                key={f.id}
                folder={f}
                location={q ? pathOf(f.parent_id) : null}
                onOpen={() => open(f.id)}
                onDropItem={(e) => dropOn(f.id, e)}
              />
            ))}
            {shownFiles.map((f) => (
              <FileItem key={f.id} file={f} location={q ? pathOf(f.folder_id) : null} />
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalBytes)} in this project · Files are private to
        people on this project.
      </p>

      <UploadPanel />

      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80">
          <p className="rounded-lg bg-card px-4 py-3 text-sm font-medium shadow-lg">Drop to upload to {here}</p>
        </div>
      )}

      {newFolderOpen && (
        <NameDialog
          open
          onOpenChange={setNewFolderOpen}
          title={currentId ? `New folder in ${here}` : "New folder"}
          kind="folder"
          submitLabel="Create"
          onSubmit={async (name) => Boolean(await createFolder(name, currentId))}
        />
      )}
    </div>
  );
}

// Something files and folders can be dropped onto (to move them there).
function DropTarget({
  onDropItem,
  disabled = false,
  children,
}: {
  onDropItem: (e: React.DragEvent) => void;
  disabled?: boolean;
  children: (over: boolean) => React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  if (disabled) return <>{children(false)}</>;
  return (
    <span
      className="contents"
      onDragOver={(e) => {
        if (!hasItem(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!hasItem(e)) return;
        e.preventDefault();
        setOver(false);
        onDropItem(e);
      }}
    >
      {children(over)}
    </span>
  );
}

const rowClass =
  "group grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 px-3 py-2 transition hover:bg-(--hover) sm:grid-cols-[minmax(0,1fr)_96px_120px_40px]";
const menuButton =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100";

function startDrag(e: React.DragEvent, item: DragItem) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = "move";
}

function FolderItem({
  folder,
  location,
  onOpen,
  onDropItem,
}: {
  folder: FolderRow;
  location: string | null;
  onOpen: () => void;
  onDropItem: (e: React.DragEvent) => void;
}) {
  const { files, folders, renameFolder, deleteFolder } = useFiles();
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [over, setOver] = useState(false);

  const count = files.filter((f) => f.folder_id === folder.id).length + folders.filter((f) => f.parent_id === folder.id).length;
  const subtree = folderSubtree(folders, folder.id);
  const allFiles = files.filter((f) => f.folder_id && subtree.has(f.folder_id)).length;

  return (
    <li
      draggable
      onDragStart={(e) => startDrag(e, { type: "folder", id: folder.id })}
      onDragOver={(e) => {
        if (!hasItem(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!hasItem(e)) return;
        e.preventDefault();
        setOver(false);
        onDropItem(e);
      }}
      className={cn(rowClass, over && "bg-primary/10 ring-1 ring-inset ring-primary")}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
        <Folder className="size-5 shrink-0 fill-[#e5b94e]/20 text-(--warn)" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{folder.name}</span>
          {location && <span className="block truncate text-xs text-muted-foreground">{location}</span>}
        </span>
      </button>
      <span className="hidden text-xs text-muted-foreground sm:block">
        {count} item{count === 1 ? "" : "s"}
      </span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(folder.created_at)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`More options for folder ${folder.name}`} className={menuButton}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            <FolderInput className="size-4" /> Move to…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "rename" && (
        <NameDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Rename folder"
          initial={folder.name}
          kind="folder"
          submitLabel="Rename"
          onSubmit={(name) => renameFolder(folder.id, name)}
        />
      )}
      {dialog === "move" && (
        <MoveDialog open item={{ type: "folder", folder }} onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialog === "delete" && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Delete “${folder.name}”?`}
          description={
            allFiles || subtree.size > 1
              ? `This permanently deletes the folder and everything in it: ${allFiles} file${allFiles === 1 ? "" : "s"}${subtree.size > 1 ? ` and ${subtree.size - 1} subfolder${subtree.size === 2 ? "" : "s"}` : ""}. This can't be undone.`
              : "The folder is empty. This can't be undone."
          }
          onConfirm={() => deleteFolder(folder.id)}
        />
      )}
    </li>
  );
}

function FileItem({ file, location }: { file: FileRow; location: string | null }) {
  const { renameFile, deleteFile } = useFiles();
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | "preview" | null>(null);
  const kind = kindOf(file.name, file.mime_type);
  const { icon: Icon, color } = KIND_ICON[kind];
  const view = fileHref(file.project_id, file.id);
  const download = fileHref(file.project_id, file.id, true);

  const name = (
    <>
      <Icon className="size-5 shrink-0" style={{ color }} />
      <span className="min-w-0">
        <span className="block truncate text-sm">{file.name}</span>
        <span className="block truncate text-xs text-muted-foreground sm:hidden">
          {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
        </span>
        {location && <span className="block truncate text-xs text-muted-foreground">{location}</span>}
      </span>
    </>
  );

  return (
    <li draggable onDragStart={(e) => startDrag(e, { type: "file", id: file.id })} className={rowClass}>
      {/* Images open a preview here; PDFs and text open in a new tab; others download. */}
      {kind === "image" ? (
        <button type="button" onClick={() => setDialog("preview")} className="flex min-w-0 items-center gap-3 text-left">
          {name}
        </button>
      ) : opensInBrowser(kind) ? (
        <a href={view} target="_blank" rel="noopener noreferrer" draggable={false} className="flex min-w-0 items-center gap-3">
          {name}
        </a>
      ) : (
        <a href={download} draggable={false} className="flex min-w-0 items-center gap-3">
          {name}
        </a>
      )}
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{formatBytes(file.size_bytes)}</span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(file.created_at)}</span>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`More options for ${file.name}`} className={menuButton}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {opensInBrowser(kind) && (
            <DropdownMenuItem onSelect={() => window.open(view, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-4" /> Open
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => (window.location.href = download)}>
            <Download className="size-4" /> Download
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            <FolderInput className="size-4" /> Move to…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "preview" && <ImagePreview open file={file} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "rename" && (
        <NameDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Rename file"
          initial={file.name}
          kind="file"
          submitLabel="Rename"
          onSubmit={(n) => renameFile(file.id, n)}
        />
      )}
      {dialog === "move" && <MoveDialog open item={{ type: "file", file }} onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "delete" && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Delete “${file.name}”?`}
          description="The file is deleted permanently for everyone on this project. This can't be undone."
          onConfirm={() => deleteFile(file.id)}
        />
      )}
    </li>
  );
}

function UploadPanel() {
  const { uploads, clearUploads } = useFiles();
  if (uploads.length === 0) return null;
  const busy = uploads.some((u) => u.state === "uploading" || u.state === "waiting");
  const done = uploads.filter((u) => u.state === "done").length;

  return (
    <section aria-label="Uploads" aria-live="polite" className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {busy ? "Uploading…" : `Uploaded ${done} of ${uploads.length}`}
        </h2>
        {!busy && (
          <button type="button" onClick={clearUploads} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {uploads.map((u) => (
          <li key={u.key} className="flex items-start gap-2 text-sm">
            {u.state === "done" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-(--ok)" />
            ) : u.state === "error" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-(--danger-soft)" />
            ) : (
              <Loader2 className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", u.state === "uploading" && "animate-spin")} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{u.name}</span>
              {u.message && <span className="block text-xs text-(--danger-soft)">{u.message}</span>}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(u.size)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
