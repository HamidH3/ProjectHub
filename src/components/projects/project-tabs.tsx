"use client";

// The tab bar inside a project: Overview, Notes, Tasks, Calendar, Files, Members.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", path: "" },
  { label: "Notes", path: "/notes" },
  { label: "Tasks", path: "/tasks" },
  { label: "Calendar", path: "/calendar" },
  { label: "Files", path: "/files" },
  { label: "Members", path: "/members" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav aria-label="Project sections" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const href = base + tab.path;
        const active = tab.path === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition outline-none focus-visible:text-foreground",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
