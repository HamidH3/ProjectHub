// Remembers, on this device, which note you last had open in each project, so
// the Notes tab brings you back to it. Only the note's id is kept (in the
// browser's localStorage); if storage is unavailable, nothing is remembered.
const key = (projectId: string) => `ph-last-note:${projectId}`;

export function rememberLastNote(projectId: string, noteId: string) {
  try {
    window.localStorage.setItem(key(projectId), noteId);
  } catch {
    // private browsing or storage switched off: fine, just not remembered
  }
}

export function lastNote(projectId: string): string | null {
  try {
    return window.localStorage.getItem(key(projectId));
  } catch {
    return null;
  }
}

export function forgetLastNote(projectId: string, noteIds: Iterable<string>) {
  try {
    const current = window.localStorage.getItem(key(projectId));
    if (current && new Set(noteIds).has(current)) window.localStorage.removeItem(key(projectId));
  } catch {
    // nothing to do
  }
}
