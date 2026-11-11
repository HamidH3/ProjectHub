"use client";

import { useActionState } from "react";
import { setupAdmin } from "@/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function SetupForm() {
  const [state, action] = useActionState(setupAdmin, undefined);

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} />
      <Field label="Setup token" name="token" type="password" autoComplete="off" required />
      <Field label="Your name" name="fullName" defaultValue={state?.values?.fullName} autoComplete="name" required />
      <Field label="Email" name="email" type="email" defaultValue={state?.values?.email} autoComplete="email" required />
      <Field
        label="Username"
        name="username"
        defaultValue={state?.values?.username ?? "hamidh3"}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        hint="You can sign in with this or your email."
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        hint="At least 12 characters. A short phrase of random words works well."
        required
      />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton pendingText="Creating account…">Create admin account</SubmitButton>
    </form>
  );
}
