"use client";

// The frame around every logged-in page: the sidebar on the left (desktop,
// collapsible) or a slide-out drawer (phone), and the page on the right.
// The collapsed/expanded choice is kept in a cookie so it survives reloads.
import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import type { SidebarProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { SearchButton, SearchProvider } from "@/components/search/search-dialog";

type Props = {
  user: Pick<CurrentUser, "fullName" | "username" | "email" | "role" | "canCreateProjects" | "canUseMeetingBot">;
  projects: SidebarProject[];
  meetingsWaiting: number;
  initiallyCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ user, projects, meetingsWaiting, initiallyCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  return (
    <SearchProvider projects={projects.filter((p) => !p.archived_at).map((p) => ({ id: p.id, name: p.name, color: p.color }))}>
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar user={user} projects={projects} meetingsWaiting={meetingsWaiting} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {/* Phone drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Projects and settings</SheetDescription>
          <Sidebar user={user} projects={projects} meetingsWaiting={meetingsWaiting} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="size-5 rounded-md bg-primary" /> ProjectHub
          </Link>
          <SearchButton className="ml-auto" />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
    </SearchProvider>
  );
}
