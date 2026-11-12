"use client";

// Shared state for a project's files and folders, and the actions that change
// them. Files go straight from the browser to the private storage bucket; the
// database's security rules decide what is allowed.
import { createContext, use, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_LABEL,
  BUCKET,
  FILE_COLUMNS,
  FOLDER_COLUMNS,
  FOLDER_NAME_MAX,
  MAX_FILE_BYTES,
  storagePathFor,
  tidyFileName,
  uniqueName,
  uploadTypeFor,
  type FileRow,
  type FolderRow,
} from "@/lib/file-types";

export type Upload = {
  key: string;
  name: string;
  size: number;
  state: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

type FilesValue = {
  projectId: string;
  files: FileRow[];
  folders: FolderRow[];
  uploads: Upload[];
  clearUploads: () => void;
  uploadFiles: (list: File[], folderId: string | null) => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<FolderRow | null>;
  renameFolder: (id: string, name: string) => Promise<boolean>;
  moveFolder: (id: string, parentId: string | null) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<boolean>;
  renameFile: (id: string, name: string) => Promise<boolean>;
  moveFile: (id: string, folderId: string | null) => Promise<boolean>;
  deleteFile: (id: string) => Promise<boolean>;
};

const FilesContext = createContext<FilesValue | null>(null);

export function useFiles() {
  const value = use(FilesContext);
  if (!value) throw new Error("useFiles must be used inside FilesProvider");
  return value;
}

// A folder and every folder inside it, at any depth.
export function folderSubtree(folders: FolderRow[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

function folderProblem(name: string): string | null {
  const t = name.trim();
  if (!t) return "Give the folder a name.";
  if (t.length > FOLDER_NAME_MAX) return `Keep the name under ${FOLDER_NAME_MAX} characters.`;
  if (/[\\/]/.test(t)) return "Folder names can't contain / or \\.";
  return null;
}

const UPLOADS_AT_ONCE = 3;

export function FilesProvider({
  projectId,
  initialFiles,
  initialFolders,
  children,
}: {
  projectId: string;
  initialFiles: FileRow[];
  initialFolders: FolderRow[];
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState(initialFiles);
  const [folders, setFolders] = useState(initialFolders);
  const [uploads, setUploads] = useState<Upload[]>([]);

  // If the server sends a fresh list, use it.
  const [seen, setSeen] = useState({ initialFiles, initialFolders });
  if (seen.initialFiles !== initialFiles || seen.initialFolders !== initialFolders) {
    setSeen({ initialFiles, initialFolders });
    setFiles(initialFiles);
    setFolders(initialFolders);
  }

  const setUpload = useCallback(
    (key: string, patch: Partial<Upload>) => setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...patch } : u))),
    [],
  );

  // ---- uploads -----------------------------------------------------------
  const uploadFiles = useCallback(
    async (list: File[], folderId: string | null) => {
      if (list.length === 0) return;
      // Names already used in this folder (so a second "report.pdf" becomes "report (2).pdf").
      const taken = new Set(files.filter((f) => f.folder_id === folderId).map((f) => f.name.toLowerCase()));

      const jobs = list.map((file) => {
        const key = crypto.randomUUID();
        const name = uniqueName(tidyFileName(file.name), taken);
        taken.add(name.toLowerCase());
        const type = uploadTypeFor(file.name, file.type);
        let problem: string | undefined;
        if (!type) problem = `Not a supported type. You can upload ${ALLOWED_LABEL} files.`;
        else if (file.size === 0) problem = "The file is empty.";
        else if (file.size > MAX_FILE_BYTES) problem = "Bigger than the 50 MB limit.";
        return { key, file, name, type, problem };
      });

      setUploads((all) => [
        ...all,
        ...jobs.map((j) => ({
          key: j.key,
          name: j.name,
          size: j.file.size,
          state: j.problem ? ("error" as const) : ("waiting" as const),
          message: j.problem,
        })),
      ]);

      const queue = jobs.filter((j) => !j.problem);
      const uploadOne = async (job: (typeof queue)[number]) => {
        setUpload(job.key, { state: "uploading" });
        const id = crypto.randomUUID();
        const path = storagePathFor(projectId, id, job.name);

        const stored = await supabase.storage.from(BUCKET).upload(path, job.file, {
          contentType: job.type!,
          upsert: false,
          cacheControl: "3600",
        });
        if (stored.error) {
          setUpload(job.key, { state: "error", message: "Upload failed. Check your connection and try again." });
          return;
        }

        const { data, error } = await supabase
          .from("files")
          .insert({
            id,
            project_id: projectId,
            folder_id: folderId,
            storage_path: path,
            name: job.name,
            mime_type: job.type!,
            size_bytes: job.file.size,
          })
          .select(FILE_COLUMNS)
          .single();
        if (error || !data) {
          // Don't leave a stored file with no record pointing at it.
          await supabase.storage.from(BUCKET).remove([path]);
          setUpload(job.key, { state: "error", message: "Couldn't save the file's details. Try again." });
          return;
        }
        setFiles((all) => [data, ...all]);
        setUpload(job.key, { state: "done" });
      };

      // A few at a time.
      let next = 0;
      const worker = async () => {
        while (next < queue.length) await uploadOne(queue[next++]);
      };
      await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, queue.length) }, worker));
    },
    [files, projectId, setUpload, supabase],
  );

  const clearUploads = useCallback(
    () => setUploads((all) => all.filter((u) => u.state === "uploading" || u.state === "waiting")),
    [],
  );

  // ---- folders -----------------------------------------------------------
  const createFolder = useCallback(
    async (name: string, parentId: string | null) => {
      const problem = folderProblem(name);
      if (problem) {
        toast.error(problem);
        return null;
      }
      const { data, error } = await supabase
        .from("folders")
        .insert({ project_id: projectId, parent_id: parentId, name: name.trim() })
        .select(FOLDER_COLUMNS)
        .single();
      if (error || !data) {
        toast.error(error?.code === "23505" ? "There's already a folder with that name here." : "Couldn't create the folder.");
        return null;
      }
      setFolders((all) => [...all, data]);
      return data;
    },
    [projectId, supabase],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const problem = folderProblem(name);
      if (problem) {
        toast.error(problem);
        return false;
      }
      const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", id);
      if (error) {
        toast.error(error.code === "23505" ? "There's already a folder with that name here." : "Couldn't rename the folder.");
        return false;
      }
      setFolders((all) => all.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
      return true;
    },
    [supabase],
  );

  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      if (parentId && folderSubtree(folders, id).has(parentId)) {
        toast.error("A folder can't go inside itself.");
        return false;
      }
      const { error } = await supabase.from("folders").update({ parent_id: parentId }).eq("id", id);
      if (error) {
        toast.error(error.code === "23505" ? "There's already a folder with that name there." : "Couldn't move the folder.");
        return false;
      }
      setFolders((all) => all.map((f) => (f.id === id ? { ...f, parent_id: parentId } : f)));
      toast.success("Folder moved");
      return true;
    },
    [folders, supabase],
  );

  // Deletes the stored files first, then their records, then the folder (its
  // subfolders go with it).
  const deleteFolder = useCallback(
    async (id: string) => {
      const ids = folderSubtree(folders, id);
      const inside = files.filter((f) => f.folder_id && ids.has(f.folder_id));
      const paths = inside.map((f) => f.storage_path);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        if (error) {
          toast.error("Couldn't delete the files in this folder. Nothing else was changed.");
          return false;
        }
      }
      if (inside.length) {
        const { error } = await supabase.from("files").delete().in("id", inside.map((f) => f.id));
        if (error) {
          toast.error("Couldn't finish deleting. Refresh the page and try again.");
          return false;
        }
      }
      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) {
        toast.error("Couldn't delete the folder.");
        return false;
      }
      setFiles((all) => all.filter((f) => !(f.folder_id && ids.has(f.folder_id))));
      setFolders((all) => all.filter((f) => !ids.has(f.id)));
      toast.success(inside.length ? `Folder and ${inside.length} file${inside.length === 1 ? "" : "s"} deleted` : "Folder deleted");
      return true;
    },
    [files, folders, supabase],
  );

  // ---- files -------------------------------------------------------------
  // Renames it in the app and in Storage (the stored file is moved to its new
  // name; if saving the new name then fails, it's moved back).
  const renameFile = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) {
        toast.error("Give the file a name.");
        return false;
      }
      const file = files.find((f) => f.id === id);
      if (!file) return false;
      const clean = tidyFileName(name);
      const newPath = storagePathFor(file.project_id, file.id, clean);
      const moving = newPath !== file.storage_path;

      if (moving) {
        const moved = await supabase.storage.from(BUCKET).move(file.storage_path, newPath);
        if (moved.error) {
          toast.error("Couldn't rename the file.");
          return false;
        }
      }
      const { error } = await supabase.from("files").update({ name: clean, storage_path: newPath }).eq("id", id);
      if (error) {
        if (moving) await supabase.storage.from(BUCKET).move(newPath, file.storage_path);
        toast.error("Couldn't rename the file.");
        return false;
      }
      setFiles((all) => all.map((f) => (f.id === id ? { ...f, name: clean, storage_path: newPath } : f)));
      return true;
    },
    [files, supabase],
  );

  const moveFile = useCallback(
    async (id: string, folderId: string | null) => {
      const before = files.find((f) => f.id === id);
      if (!before || before.folder_id === folderId) return false;
      setFiles((all) => all.map((f) => (f.id === id ? { ...f, folder_id: folderId } : f)));
      const { error } = await supabase.from("files").update({ folder_id: folderId }).eq("id", id);
      if (error) {
        setFiles((all) => all.map((f) => (f.id === id ? before : f)));
        toast.error("Couldn't move the file.");
        return false;
      }
      const where = folderId ? folders.find((f) => f.id === folderId)?.name : "Files";
      toast.success(`Moved to ${where ?? "folder"}`);
      return true;
    },
    [files, folders, supabase],
  );

  const deleteFile = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return false;
      const stored = await supabase.storage.from(BUCKET).remove([file.storage_path]);
      if (stored.error) {
        toast.error("Couldn't delete the file.");
        return false;
      }
      const { error } = await supabase.from("files").delete().eq("id", id);
      if (error) {
        toast.error("Couldn't finish deleting. Refresh the page and try again.");
        return false;
      }
      setFiles((all) => all.filter((f) => f.id !== id));
      toast.success("File deleted");
      return true;
    },
    [files, supabase],
  );

  const value = useMemo<FilesValue>(
    () => ({
      projectId,
      files,
      folders,
      uploads,
      clearUploads,
      uploadFiles,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      renameFile,
      moveFile,
      deleteFile,
    }),
    [
      projectId,
      files,
      folders,
      uploads,
      clearUploads,
      uploadFiles,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      renameFile,
      moveFile,
      deleteFile,
    ],
  );

  return <FilesContext value={value}>{children}</FilesContext>;
}
