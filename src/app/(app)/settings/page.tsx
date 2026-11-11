import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

// Account details for now. Editing your profile, managing users and app
// settings come in later steps.
export default async function SettingsPage() {
  const user = await getCurrentUser();

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
