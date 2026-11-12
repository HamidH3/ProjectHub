// Helpers for search results. Safe to use on the server and in the browser.

export type SearchKind = "project" | "note" | "task" | "meeting" | "file";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  project_id: string;
  project_name: string;
  project_color: string;
  title: string;
  snippet: string | null;
  detail: string | null;
  folder_id: string | null;
  done: boolean | null;
};

// Where each result takes you.
export function hrefFor(hit: Pick<SearchHit, "kind" | "id" | "project_id" | "detail" | "folder_id">): string {
  const base = `/projects/${hit.project_id}`;
  switch (hit.kind) {
    case "project":
      return base;
    case "note":
      return `${base}/notes/${hit.id}`;
    case "task":
      return `${base}/tasks`;
    case "meeting":
      return `${base}/calendar${hit.detail && /^\d{4}-\d{2}/.test(hit.detail) ? `?month=${hit.detail.slice(0, 7)}` : ""}`;
    case "file":
      return `${base}/files${hit.folder_id ? `?folder=${hit.folder_id}` : ""}`;
  }
}

// "…the ⟦budget⟧ for…" → [{text:"…the "}, {text:"budget", match:true}, {text:" for…"}]
export function splitHighlights(text: string): { text: string; match: boolean }[] {
  return text
    .split(/(⟦[^⟧]*⟧)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("⟦") && part.endsWith("⟧") ? { text: part.slice(1, -1), match: true } : { text: part, match: false },
    );
}
