"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} success={state?.success} />
      <Field
        label="Email"
        name="email"
        type="email"
        defaultValue={state?.values?.email}
        autoComplete="email"
        required
        autoFocus
      />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
