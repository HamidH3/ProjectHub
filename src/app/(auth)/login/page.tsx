import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  done: "Your admin account is ready. Sign in to continue.",
};
const ERRORS: Record<string, string> = {
  link: "That link has expired or has already been used. Request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">Welcome back.</p>
      <LoginForm
        next={safeNextPath(one(params.next))}
        notice={NOTICES[one(params.setup) ?? ""]}
        linkError={ERRORS[one(params.error) ?? ""]}
      />
    </>
  );
}
