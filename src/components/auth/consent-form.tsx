"use client";

// The two buttons on the "Connect Claude to ProjectHub" page.
import { useActionState } from "react";
import { decideConnection } from "@/actions/oauth";
import { FormMessage } from "@/components/auth/form-bits";
import { Button } from "@/components/ui/button";

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [state, action, pending] = useActionState(decideConnection, undefined);
  return (
    <form action={action} className="mt-6 space-y-3">
      <FormMessage error={state?.error} />
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <Button type="submit" name="decision" value="allow" className="w-full" disabled={pending}>
        {pending ? "One moment…" : "Allow"}
      </Button>
      <Button type="submit" name="decision" value="deny" variant="outline" className="w-full" disabled={pending}>
        Don&apos;t allow
      </Button>
    </form>
  );
}
