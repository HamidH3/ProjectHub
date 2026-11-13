import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getSidebarProjects } from "@/lib/projects";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { AppShell } from "@/components/layout/app-shell";
import { countWaitingForProject } from "@/lib/meetings/data";

// Everything inside (app) requires a signed-in user who has passed 2FA.
// getCurrentUser() redirects to /login or /mfa otherwise.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [projects, cookieStore, meetingsWaiting] = await Promise.all([
    getSidebarProjects(),
    cookies(),
    // Only admins can send the meeting bot, so only they have recordings.
    user.role === "admin" ? countWaitingForProject() : 0,
  ]);
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <AppShell
      user={{ fullName: user.fullName, username: user.username, email: user.email, role: user.role }}
      projects={projects}
      meetingsWaiting={meetingsWaiting}
      initiallyCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
