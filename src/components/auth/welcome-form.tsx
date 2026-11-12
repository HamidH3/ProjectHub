"use client";

import { useActionState } from "react";
import { completeWelcome } from "@/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function WelcomeForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action] = useActionState(completeWelcome, undefined);
  const values = state?.values;

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} />
      {email && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Email: </span>
          {email}
        </p>
      )}
      <Field label="Your name" name="fullName" autoComplete="name" defaultValue={values?.fullName ?? fullName} required maxLength={100} autoFocus />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        defaultValue={values?.username ?? ""}
        hint="3–30 lowercase letters, numbers or underscores."
        pattern="[a-zA-Z0-9_]{3,30}"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        hint="At least 12 characters."
        required
      />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton pendingText="Setting up…">Start using ProjectHub</SubmitButton>
    </form>
  );
}
