"use client";

// The left-hand sidebar: app name, project search, New project, the project
// list with its menus, and settings / profile / sign out at the bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSearch } from "@/components/search/search-dialog";
import { CalendarDays, ChevronDown, House, Mic, Users, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings } from "lucide-react";
import { signOut } from "@/actions/auth";
import type { CurrentUser } from "@/lib/auth";
import type { SidebarProject } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectMenu } from "@/components/projects/project-menu";
import { ProjectDot } from "@/components/projects/project-dot";

type Props = {
  user: Pick<CurrentUser, "fullName" | "username" | "email" | "role" | "canCreateProjects" | "canUseMeetingBot">;
  projects: SidebarProject[];
  meetingsWaiting?: number; // recorded meetings waiting for a project
  collapsed: boolean;
  onToggleCollapsed?: () => void; // not shown in the mobile drawer
  onNavigate?: () => void; // closes the mobile drawer after a click
};

const itemClass =
  "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/80 outline-none transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring";

export function Sidebar({ user, projects, meetingsWaiting = 0, collapsed, onToggleCollapsed, onNavigate }: Props) {
  const pathname = usePathname();
  const { openSearch } = useSearch();
  const [listOpen, setListOpen] = useState(true);
  const isAdmin = user.role === "admin";
  const displayName = user.fullName || user.username || "You";

  const filtered = projects;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Top: name + collapse */}
      <div className={cn("flex h-14 shrink-0 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <Link href="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <span aria-hidden className="size-6 shrink-0 rounded-md bg-primary" />
            <span className="truncate font-semibold tracking-tight">ProjectHub</span>
          </Link>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>

      {/* Search + New project */}
      <div className={cn("space-y-2 px-3 pb-3", collapsed && "flex flex-col items-center px-0")}>
        {collapsed ? (
          <>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                openSearch();
              }}
              aria-label="Search everything (Ctrl+K)"
              title="Search (Ctrl+K)"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
            {user.canCreateProjects && <NewProjectButton variant="icon" />}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                openSearch();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2.5 text-sm text-muted-foreground transition hover:border-sidebar-ring hover:text-foreground"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-sidebar-border px-1.5 text-[10px]">Ctrl K</kbd>
            </button>
            {user.canCreateProjects && <NewProjectButton variant="sidebar" />}
          </>
        )}
      </div>

      {/* Home + projects */}
      <nav aria-label="Main" className={cn("min-h-0 flex-1 overflow-y-auto px-3", collapsed && "px-2")}>
        <Link
          href="/"
          onClick={onNavigate}
          title="Home"
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(itemClass, collapsed && "justify-center px-0", pathname === "/" && "bg-sidebar-accent text-sidebar-foreground")}
        >
          <House className="size-4 shrink-0" />
          {!collapsed && "Home"}
        </Link>
        <Link
          href="/calendar"
          onClick={onNavigate}
          title="Calendar"
          aria-current={pathname === "/calendar" ? "page" : undefined}
          className={cn(
            itemClass,
            "mt-0.5",
            collapsed && "justify-center px-0",
            pathname === "/calendar" && "bg-sidebar-accent text-sidebar-foreground",
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          {!collapsed && "Calendar"}
        </Link>
        {isAdmin && (
          <Link
            href="/people"
            onClick={onNavigate}
            title="People"
            aria-current={pathname === "/people" ? "page" : undefined}
            className={cn(
              itemClass,
              "mt-0.5",
              collapsed && "justify-center px-0",
              pathname === "/people" && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Users className="size-4 shrink-0" />
            {!collapsed && "People"}
          </Link>
        )}
        {(user.canUseMeetingBot || meetingsWaiting > 0) && (
          <Link
            href="/recorder"
            onClick={onNavigate}
            title={meetingsWaiting ? `Meeting recorder (${meetingsWaiting} waiting for a project)` : "Meeting recorder"}
            aria-current={pathname === "/recorder" ? "page" : undefined}
            className={cn(
              itemClass,
              "relative mt-0.5",
              collapsed && "justify-center px-0",
              pathname === "/recorder" && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Mic className="size-4 shrink-0" />
            {!collapsed && <span className="flex-1">Meeting recorder</span>}
            {meetingsWaiting > 0 && (
              <span
                aria-label={`${meetingsWaiting} waiting for a project`}
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground",
                  collapsed && "absolute -top-1 -right-1",
                )}
              >
                {meetingsWaiting}
              </span>
            )}
          </Link>
        )}

        <div className="mt-5">
          {!collapsed && (
            <button
              type="button"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
              className="mb-1 flex w-full items-center justify-between px-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground hover:text-foreground"
            >
              MY PROJECTS
              <ChevronDown className={cn("size-3.5 transition", !listOpen && "-rotate-90")} />
            </button>
          )}

          {(listOpen || collapsed) && (
            <ul className="space-y-0.5">
              {filtered.map((p) => {
                const href = `/projects/${p.id}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={p.id} className="group relative">
                    <Link
                      href={href}
                      onClick={onNavigate}
                      title={p.name}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        itemClass,
                        collapsed ? "justify-center px-0" : "pr-9",
                        active && "bg-sidebar-accent text-sidebar-foreground",
                      )}
                    >
                      <ProjectDot color={p.color} />
                      {!collapsed && <span className="truncate">{p.name}</span>}
                    </Link>
                    {isAdmin && !collapsed && (
                      <ProjectMenu
                        project={p}
                        className="absolute right-1 top-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                      />
                    )}
                  </li>
                );
              })}
              {!collapsed && filtered.length === 0 && (
                <li className="px-2.5 py-2 text-sm text-muted-foreground">
                  No projects yet.
                </li>
              )}
            </ul>
          )}
        </div>
      </nav>

      {/* Bottom: settings, profile, sign out */}
      <div className={cn("shrink-0 space-y-0.5 border-t border-sidebar-border p-3", collapsed && "px-2")}>
        <Link
          href="/settings"
          onClick={onNavigate}
          title="Settings"
          className={cn(itemClass, collapsed && "justify-center px-0", pathname.startsWith("/settings") && "bg-sidebar-accent")}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
        <div className={cn("flex items-center gap-2.5 px-2.5 py-2", collapsed && "justify-center px-0")} title={displayName}>
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
          >
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email ?? user.username}</p>
            </div>
          )}
        </div>
        <form action={signOut}>
          <button type="submit" title="Sign out" className={cn(itemClass, "w-full", collapsed && "justify-center px-0")}>
            <LogOut className="size-4 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </form>
      </div>
    </div>
  );
}
