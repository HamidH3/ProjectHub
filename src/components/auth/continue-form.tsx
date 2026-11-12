"use client";

// The "Continue" button on invite and reset pages. Pressing it is what uses
// the link, so automatic link checkers can't.
import { useActionState } from "react";
import { acceptInvite, continueEmailLink } from "@/actions/invite";
import { FormMessage, SubmitButton } from "@/components/auth/form-bits";

export function AcceptInviteForm({ code }: { code: string }) {
  const [state, action] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} />
      <input type="hidden" name="code" value={code} />
      <SubmitButton pendingText="Opening your invite…">Continue</SubmitButton>
    </form>
  );
}

export function ContinueLinkForm({ tokenHash, type, next, label }: { tokenHash: string; type: string; next: string; label: string }) {
  const [state, action] = useActionState(continueEmailLink, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage error={state?.error} />
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <SubmitButton pendingText="One moment…">{label}</SubmitButton>
    </form>
  );
}
