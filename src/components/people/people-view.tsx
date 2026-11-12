"use client";

// The People page: open invites, and everyone with an account: their role,
// projects and 2FA. Admins only (the page and every action check that).
import { useState, useTransition } from "react";
import { Clock, KeyRound, MailCheck, MailWarning, MoreHorizontal, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colorOf } from "@/lib/project-colors";
import { cn } from "@/lib/utils";
import type { PendingInvite, Person } from "@/lib/people";
import {
  cancelInvite,
  changeRole,
  newSetupLink,
  removeUser,
  resendInvite,
  sendPasswordReset,
  setUserProjects,
  type LinkResult,
} from "@/actions/members";
import { InviteDialog, LinkShare, ProjectChecklist, type ProjectOption } from "@/components/people/invite-dialog";

function when(iso: string | null, timezone: string) {
  if (!iso) return "Never";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function Initial({ name, admin }: { name: string; admin?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        admin ? "bg-primary/20 text-primary" : "bg-accent text-foreground",
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const menuButton =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground";

export function PeopleView({
  meId,
  people,
  pending,
  projects,
  timezone,
  sender,
}: {
  meId: string;
  people: Person[];
  pending: PendingInvite[];
  projects: ProjectOption[];
  timezone: string;
  sender: string | null; // the address emails are sent from, or null if email isn't set up
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite people, choose which projects they can open, and remove access.
          </p>
        </div>
        <Button
          onClick={() => {
            setInviteKey((k) => k + 1); // a fresh form each time
            setInviteOpen(true);
          }}
        >
          <UserPlus className="size-4" /> Invite someone
        </Button>
      </div>

      {sender ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <MailCheck className="size-4 shrink-0 text-[#5fc9a0]" />
          Invites and reset links are emailed automatically from <span className="text-foreground">{sender}</span>.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-[#e5b94e]/40 bg-[#e5b94e]/10 px-3 py-2 text-sm">
          <MailWarning className="mt-0.5 size-4 shrink-0 text-[#e5b94e]" />
          <span>
            Email isn&apos;t set up yet, so invites show a link for you to copy and send. To email them automatically
            from your own Gmail, add the four SMTP settings (see PROJECTHUB.md, &ldquo;Email&rdquo;).
          </span>
        </p>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
            INVITED · NOT JOINED YET
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {pending.map((i) => (
              <PendingRow key={i.id} invite={i} projects={projects} timezone={timezone} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
          EVERYONE · {people.length}
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} isMe={p.id === meId} projects={projects} timezone={timezone} />
          ))}
        </ul>
      </section>

      <InviteDialog key={inviteKey} open={inviteOpen} onOpenChange={setInviteOpen} projects={projects} />
    </div>
  );
}

function ProjectChips({ ids, projects, role }: { ids: string[]; projects: ProjectOption[]; role: Person["role"] }) {
  if (role === "admin") return <span className="text-xs text-muted-foreground">All projects</span>;
  const list = projects.filter((p) => ids.includes(p.id));
  if (list.length === 0) return <span className="text-xs text-muted-foreground">No projects yet</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {list.slice(0, 4).map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: colorOf(p.color).dot }} />
          {p.name}
        </span>
      ))}
      {list.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{list.length - 4}</span>}
    </span>
  );
}

function PendingRow({ invite, projects, timezone }: { invite: PendingInvite; projects: ProjectOption[]; timezone: string }) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<Extract<LinkResult, { ok: true }> | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Initial name={invite.fullName || invite.email} />
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
        <p className="truncate text-sm font-medium">{invite.fullName || invite.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {invite.fullName ? `${invite.email} · ` : ""}
          {invite.role === "admin" ? "Administrator" : "Member"}
        </p>
        <div className="mt-1">
          <ProjectChips ids={invite.projectIds} projects={projects} role={invite.role} />
        </div>
      </div>
      <span
        className={cn(
          "ml-12 inline-flex items-center gap-1 text-xs sm:ml-0",
          invite.expired || invite.oldLink ? "text-[#ff8a80]" : "text-muted-foreground",
        )}
      >
        <Clock className="size-3" />
        {invite.oldLink ? "Old link: click Resend" : invite.expired ? "Expired" : `Sent ${when(invite.lastSentAt, timezone)}`}
      </span>
      <div className="ml-auto flex gap-1 sm:ml-0">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await resendInvite(invite.id);
              if (res.ok) setLink(res);
              else toast.error(res.error);
            })
          }
        >
          <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> Resend
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Cancel the invite for ${invite.email}`} disabled={pending} onClick={() => setConfirmCancel(true)}>
          <X className="size-4" />
        </Button>
      </div>

      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New invite link</DialogTitle>
            <DialogDescription className="sr-only">The new invite link for {invite.email}.</DialogDescription>
          </DialogHeader>
          {link && <LinkShare result={link} who={invite.email} purpose="invite" />}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel the invite for ${invite.email}?`}
        description="Their link stops working straight away. You can invite them again later."
        confirmLabel="Cancel invite"
        onConfirm={async () => {
          const res = await cancelInvite(invite.id);
          if (!res.ok) toast.error(res.error);
          else toast.success("Invite cancelled");
          return res.ok;
        }}
      />
    </li>
  );
}

function PersonRow({ person, isMe, projects, timezone }: { person: Person; isMe: boolean; projects: ProjectOption[]; timezone: string }) {
  const [dialog, setDialog] = useState<"access" | "remove" | "role" | null>(null);
  const [link, setLink] = useState<(Extract<LinkResult, { ok: true }> & { purpose: "invite" | "reset" }) | null>(null);
  const [, startTransition] = useTransition();
  const newRole = person.role === "admin" ? "member" : "admin";

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Initial name={person.name} admin={person.role === "admin"} />
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
        <p className="truncate text-sm font-medium">
          {person.name}
          {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[person.username && `@${person.username}`, person.email].filter(Boolean).join(" · ")}
        </p>
        {!person.setUp && (
          <p className="mt-1 text-xs text-[#e5b94e]">Hasn&apos;t finished signing up. Use ⋯ → New sign-up link.</p>
        )}
        <div className="mt-1">
          <ProjectChips ids={person.projectIds} projects={projects} role={person.role} />
        </div>
      </div>
      <div className="ml-12 flex flex-col items-start gap-1 text-xs text-muted-foreground sm:ml-0 sm:items-end">
        <span className={cn("rounded-full px-2 py-0.5", person.role === "admin" ? "bg-primary/15 text-primary" : "bg-accent text-foreground")}>
          {person.role === "admin" ? "Administrator" : "Member"}
        </span>
        <span className="inline-flex items-center gap-1" title={person.has2fa ? "Two-factor sign-in is on" : "Two-factor sign-in is off"}>
          {person.has2fa ? <ShieldCheck className="size-3 text-[#5fc9a0]" /> : <ShieldOff className="size-3" />}
          {person.has2fa ? "2FA on" : "2FA off"} · Last in {when(person.lastSignIn, timezone)}
        </span>
      </div>

      {!isMe && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Options for ${person.name}`} className={cn(menuButton, "ml-auto sm:ml-0")}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {!person.setUp && (
              <DropdownMenuItem
                onSelect={() =>
                  startTransition(async () => {
                    const res = await newSetupLink(person.id);
                    if (res.ok) setLink({ ...res, purpose: "invite" });
                    else toast.error(res.error);
                  })
                }
              >
                <RefreshCw className="size-4" /> New sign-up link
              </DropdownMenuItem>
            )}
            {person.role === "member" && <DropdownMenuItem onSelect={() => setDialog("access")}>Choose projects…</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setDialog("role")}>
              {newRole === "admin" ? "Make administrator" : "Make member"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const res = await sendPasswordReset(person.id);
                  if (res.ok) setLink({ ...res, purpose: "reset" });
                  else toast.error(res.error);
                })
              }
            >
              <KeyRound className="size-4" /> Password reset link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("remove")}>
              <Trash2 className="size-4" /> Remove from ProjectHub
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {dialog === "access" && <AccessDialog person={person} projects={projects} onClose={() => setDialog(null)} />}

      <ConfirmDialog
        open={dialog === "role"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={newRole === "admin" ? `Make ${person.name} an administrator?` : `Make ${person.name} a member?`}
        description={
          newRole === "admin"
            ? "They'll see every project, manage people and change settings. They'll have to set up two-factor sign-in next time they open ProjectHub."
            : "They'll only see the projects they've been added to. Check their projects afterwards."
        }
        confirmLabel={newRole === "admin" ? "Make administrator" : "Make member"}
        destructive={false}
        onConfirm={async () => {
          const res = await changeRole(person.id, newRole);
          if (!res.ok) toast.error(res.error);
          else toast.success("Role changed");
          return res.ok;
        }}
      />

      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Remove ${person.name}?`}
        description="Their account is deleted and they're signed out everywhere. Notes, to-dos and files they added stay in the projects. This can't be undone, but you can invite them again."
        confirmLabel="Remove"
        onConfirm={async () => {
          const res = await removeUser(person.id);
          if (!res.ok) toast.error(res.error);
          else toast.success(`${person.name} removed`);
          return res.ok;
        }}
      />

      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{link?.purpose === "invite" ? "New sign-up link" : "Password reset link"}</DialogTitle>
            <DialogDescription className="sr-only">A link for {person.name}.</DialogDescription>
          </DialogHeader>
          {link && <LinkShare result={link} who={person.email ?? person.name} purpose={link.purpose} />}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function AccessDialog({ person, projects, onClose }: { person: Person; projects: ProjectOption[]; onClose: () => void }) {
  const [selected, setSelected] = useState(new Set(person.projectIds));
  const [pending, startTransition] = useTransition();
  const shown = projects.filter((p) => !p.archived || selected.has(p.id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Projects {person.name} can open</DialogTitle>
          <DialogDescription>They&apos;ll see these in their sidebar. Everything else stays hidden from them.</DialogDescription>
        </DialogHeader>
        <ProjectChecklist projects={shown} selected={selected} onChange={setSelected} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setUserProjects(person.id, [...selected]);
                if (res.ok) {
                  toast.success("Access updated");
                  onClose();
                } else toast.error(res.error);
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (await onConfirm()) onOpenChange(false);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
