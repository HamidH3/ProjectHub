"use client";

// "Invite someone": email, name, role and which projects they can open.
// After sending, shows whether the email went out, and the link to pass on
// yourself if it didn't (or if you'd rather send it another way).
import { useState, useTransition } from "react";
import { Check, Copy, MailCheck, MailWarning, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { colorOf } from "@/lib/project-colors";
import { cn } from "@/lib/utils";
import { inviteUser, type LinkResult } from "@/actions/members";

export type ProjectOption = { id: string; name: string; color: string; archived: boolean };

export function ProjectChecklist({
  projects,
  selected,
  onChange,
}: {
  projects: ProjectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">There are no projects yet.</p>;
  const all = projects.every((p) => selected.has(p.id));
  return (
    <div className="rounded-md border border-border">
      <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={all}
          onChange={() => onChange(all ? new Set() : new Set(projects.map((p) => p.id)))}
          className="accent-[var(--primary)]"
        />
        All projects
      </label>
      <div className="max-h-52 overflow-y-auto py-1">
        {projects.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent">
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                onChange(next);
              }}
              className="accent-[var(--primary)]"
            />
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(p.color).dot }} />
            <span className="truncate">{p.name}</span>
            {p.archived && <span className="ml-auto text-xs text-muted-foreground">Archived</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

// What to show once a link exists: emailed, or copy it yourself.
export function LinkShare({ result, who, purpose }: { result: Extract<LinkResult, { ok: true }>; who: string; purpose: "invite" | "reset" }) {
  const [copied, setCopied] = useState(false);
  const what = purpose === "invite" ? "invite" : "password reset link";
  return (
    <div className="space-y-3">
      {result.email === "sent" ? (
        <p className="flex items-start gap-2 rounded-md bg-[#5fc9a0]/10 px-3 py-2 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-[#5fc9a0]" />
          <span>
            The {what} was emailed to <strong>{who}</strong>. You can also copy the link below.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-md bg-[#e5b94e]/10 px-3 py-2 text-sm">
          <MailWarning className="mt-0.5 size-4 shrink-0 text-[#e5b94e]" />
          <span>
            {result.email === "not_configured"
              ? "Email isn't set up yet, so nothing was sent."
              : "The email couldn't be sent (check the Resend settings)."}{" "}
            Copy this link and send it to <strong>{who}</strong> yourself, e.g. by Teams or your own email.
          </span>
        </p>
      )}
      <div className="flex gap-2">
        <Input readOnly value={result.link} aria-label="Link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy. Select the link and press Ctrl+C.");
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Anyone with this link can {purpose === "invite" ? "set up this account" : "set a new password for this account"}, so only send it
        to them. It works once and expires after a while; you can always make a new one.
      </p>
    </div>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  defaultProjectIds?: string[];
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [selected, setSelected] = useState(new Set(defaultProjectIds));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<LinkResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();
  const active = projects.filter((p) => !p.archived || selected.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite ready</DialogTitle>
              <DialogDescription className="sr-only">The invite link for {email}.</DialogDescription>
            </DialogHeader>
            <LinkShare result={result} who={email} purpose="invite" />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await inviteUser({ email, fullName, role, projectIds: [...selected] });
                if (res.ok) setResult(res);
                else setError(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>They&apos;ll get a link to choose a username and password.</DialogDescription>
            </DialogHeader>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                maxLength={254}
                placeholder="name@company.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-name">Name (optional)</Label>
              <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Role</span>
              <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["member", UserRound, "Member", "Sees only the projects you choose"],
                    ["admin", ShieldCheck, "Administrator", "Sees everything and manages people. Needs 2FA."],
                  ] as const
                ).map(([value, Icon, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left transition",
                      role === value ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="size-4" /> {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            {role === "member" && (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Projects they can open</span>
                <ProjectChecklist projects={active} selected={selected} onChange={setSelected} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !email.trim()}>
                {pending ? "Creating invite…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
