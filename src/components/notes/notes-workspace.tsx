"use client";

// Notes layout: the list on the left, the open note on the right.
// On phones, the list and the note take turns filling the screen.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { NoteSummary } from "@/lib/note-tree";
import { cn } from "@/lib/utils";
import { NotesProvider, useNotes } from "@/components/notes/notes-context";
import { NoteTree } from "@/components/notes/note-tree";
import { OtherNotes } from "@/components/notes/other-notes";

export function NotesWorkspace({
  projectId,
  meId,
  writerNames,
  initialNotes,
  children,
}: {
  projectId: string;
  meId: string;
  writerNames: Record<string, string>;
  initialNotes: NoteSummary[];
  children: React.ReactNode;
}) {
  return (
    <NotesProvider projectId={projectId} meId={meId} writerNames={writerNames} initialNotes={initialNotes}>
      <Layout>{children}</Layout>
    </NotesProvider>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { activeId, projectId } = useNotes();

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside
        className={cn(
          "lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1",
          activeId && "hidden lg:block",
        )}
      >
        <NoteTree />
        <OtherNotes />
      </aside>
      <section className={cn("min-w-0", !activeId && "hidden lg:block")}>
        {activeId && (
          <Link
            href={`/projects/${projectId}/notes`}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="size-4" /> All notes
          </Link>
        )}
        {children}
      </section>
    </div>
  );
}
