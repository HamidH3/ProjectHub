"use client";

import { useActionState } from "react";
import { updatePassword } from "@/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        hint="At least 12 characters."
        required
        autoFocus
      />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
