"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function LoginForm({ next, notice, linkError }: { next: string; notice?: string; linkError?: string }) {
  const [state, action] = useActionState(signIn, undefined);

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error ?? linkError} success={state?.error ? undefined : notice} />
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email or username"
        name="identifier"
        defaultValue={state?.values?.identifier}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus
      />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
