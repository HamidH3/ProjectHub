import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a link to choose a new one.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
