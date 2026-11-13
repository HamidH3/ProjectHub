import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { THEME_COOKIE, themeOrDefault } from "@/lib/theme";
import { ThemePicker } from "@/components/settings/theme-picker";
import { ConnectedApps } from "@/components/settings/connected-apps";

export const metadata: Metadata = { title: "Settings" };

// Account details, colour theme, connected apps (Claude) and password.
export default async function SettingsPage() {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const theme = themeOrDefault(cookieStore.get(THEME_COOKIE)?.value);

  const rows: [string, string][] = [
    ["Name", user.fullName ?? "Not set"],
    ["Username", user.username ? `@${user.username}` : "Not set"],
    ["Email", user.email ?? "Not set"],
    ["Role", user.role === "admin" ? "Administrator" : "Member"],
    ["Time zone", user.timezone],
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-8 rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-3 font-medium">Your account</h2>
        <dl className="divide-y divide-border text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-5 py-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="font-medium">Appearance</h2>
          <p className="text-xs text-muted-foreground">
            Changes straight away. Each device remembers its own choice. Notes always use light paper.
          </p>
        </div>
        <ThemePicker current={theme} />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="font-medium">Connected apps</h2>
          <p className="text-xs text-muted-foreground">Apps you&apos;ve allowed to use your ProjectHub account, such as Claude.</p>
        </div>
        <ConnectedApps />
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-3 font-medium">Security</h2>
        <div className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <span className="text-muted-foreground">Password</span>
          <Link href="/update-password" className="text-primary hover:underline">
            Change password
          </Link>
        </div>
      </section>
    </div>
  );
}
