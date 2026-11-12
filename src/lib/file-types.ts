// Which files can be uploaded, how big they can be, and how to show them.
// Safe to use on the server and in the browser. The storage bucket enforces
// the same size and type rules (migration 3), so this is the friendly check
// that runs first.

import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];

export const FILE_COLUMNS = "id, project_id, folder_id, storage_path, name, mime_type, size_bytes, created_at, updated_at" as const;
export const FOLDER_COLUMNS = "id, project_id, parent_id, name, created_at" as const;

export type FileRow = Pick<
  Tables["files"]["Row"],
  "id" | "project_id" | "folder_id" | "storage_path" | "name" | "mime_type" | "size_bytes" | "created_at" | "updated_at"
>;
export type FolderRow = Pick<Tables["folders"]["Row"], "id" | "project_id" | "parent_id" | "name" | "created_at">;

export const BUCKET = "project-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const FILE_NAME_MAX = 255;
export const FOLDER_NAME_MAX = 120;

export type FileKind = "pdf" | "doc" | "sheet" | "slides" | "text" | "image" | "zip";

// Extension → the content type to store it as, and what kind of file it is.
const TYPES: Record<string, { mime: string; kind: FileKind }> = {
  pdf: { mime: "application/pdf", kind: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "doc" },
  doc: { mime: "application/msword", kind: "doc" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "sheet" },
  csv: { mime: "text/csv", kind: "sheet" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "slides" },
  txt: { mime: "text/plain", kind: "text" },
  png: { mime: "image/png", kind: "image" },
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  zip: { mime: "application/zip", kind: "zip" },
};

// Content types browsers sometimes report instead (all allowed by the bucket).
const ALSO_ALLOWED: Record<string, string[]> = {
  csv: ["application/vnd.ms-excel"],
  zip: ["application/x-zip-compressed"],
};

export const ACCEPT = Object.keys(TYPES)
  .map((ext) => `.${ext}`)
  .join(",");
export const ALLOWED_LABEL = "PDF, Word, Excel, CSV, PowerPoint, text, PNG, JPG and ZIP";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

// The content type to upload a file with, or null if it isn't allowed.
export function uploadTypeFor(name: string, browserType: string): string | null {
  const ext = extensionOf(name);
  const known = TYPES[ext];
  if (!known) return null;
  if (browserType && (browserType === known.mime || ALSO_ALLOWED[ext]?.includes(browserType))) return browserType;
  return known.mime;
}

export function kindOf(name: string, mime: string): FileKind {
  const byExt = TYPES[extensionOf(name)]?.kind;
  if (byExt) return byExt;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "text";
}

// Opened in the browser rather than downloaded.
export function opensInBrowser(kind: FileKind) {
  return kind === "pdf" || kind === "text" || kind === "image";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

// Keep the name within the limit without losing the extension.
export function tidyFileName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f]/g, "").trim() || "file";
  if (clean.length <= FILE_NAME_MAX) return clean;
  const ext = extensionOf(clean);
  const keep = FILE_NAME_MAX - (ext ? ext.length + 1 : 0);
  return ext ? `${clean.slice(0, keep)}.${ext}` : clean.slice(0, FILE_NAME_MAX);
}

// A version of the name Supabase Storage accepts in a file path: accents are
// dropped (é → e), and anything other than letters, numbers, spaces and
// - _ . ( ) becomes "_". The real name, exactly as typed, is kept in the
// database and shown in the app.
export function storageSafeName(name: string): string {
  const plain = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "");
  let safe = plain
    .replace(/[^A-Za-z0-9 _.()-]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^[ .]+|[ .]+$/g, "");
  if (!safe || /^_+$/.test(safe.replace(/\.[^.]*$/, ""))) safe = `file${extensionOf(name) ? `.${extensionOf(name)}` : ""}`;
  if (safe.length > 150) {
    const ext = extensionOf(safe);
    safe = ext ? `${safe.slice(0, 149 - ext.length).trimEnd()}.${ext}` : safe.slice(0, 150);
  }
  return safe;
}

// Where a file is kept in Storage: {project id}/{file id}/{readable name}.
export function storagePathFor(projectId: string, fileId: string, name: string): string {
  return `${projectId}/${fileId}/${storageSafeName(name)}`;
}

// "report.pdf" → "report (2).pdf" if the name is already taken.
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const ext = extensionOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let n = 2; ; n++) {
    const candidate = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
