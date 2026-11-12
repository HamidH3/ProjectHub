"use client";

// A project's Members tab. Everyone sees who has access; admins can also add
// people who already have an account, invite someone new, or remove someone.
import { useState, useTransition } from "react";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addProjectMembers, removeProjectMember } from "@/actions/members";
import { InviteDialog, type ProjectOption } from "@/components/people/invite-dialog";
import { ConfirmDialog } from "@/components/people/people-view";

type Member = { userId: string; name: string; username: string | null; role: "admin" | "member" | null };
type Addable = { id: string; name: string; username: string | null };

export function ProjectMembers({
  project,
  members,
  isAdmin,
  addable,
  projects,
}: {
  project: { id: string; name: string };
  members: Member[];
  isAdmin: boolean;
  addable: Addable[];
  projects: ProjectOption[];
}) {
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [removing, setRemoving] = useState<Member | null>(null);

  return (
    <section className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-medium">Who can open this project</h2>
          <p className="mt-1 text-sm text-muted-foreground">Administrators can open every project. The people below have been added to this one.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={addable.length === 0} title={addable.length === 0 ? "Everyone with an account is already here" : undefined}>
              <Users className="size-4" /> Add people
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setInviteKey((k) => k + 1);
                setInviting(true);
              }}
            >
              <UserPlus className="size-4" /> Invite by email
            </Button>
          </div>
        )}
      </div>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        {members.length ? (
          members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                {m.username && <p className="truncate text-xs text-muted-foreground">@{m.username}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{m.role === "admin" ? "Administrator" : "Member"}</span>
              {isAdmin && (
                <Button variant="ghost" size="sm" aria-label={`Remove ${m.name} from this project`} onClick={() => setRemoving(m)}>
                  <UserMinus className="size-4" />
                </Button>
              )}
            </li>
          ))
        ) : (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No one else has been added yet.</li>
        )}
      </ul>

      {adding && <AddPeopleDialog projectId={project.id} projectName={project.name} addable={addable} onClose={() => setAdding(false)} />}
      <InviteDialog key={inviteKey} open={inviting} onOpenChange={setInviting} projects={projects} defaultProjectIds={[project.id]} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ""} from ${project.name}?`}
        description="They won't be able to open this project any more. Anything they added stays. Their account and other projects aren't affected."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return true;
          const res = await removeProjectMember(project.id, removing.userId);
          if (!res.ok) toast.error(res.error);
          else toast.success(`${removing.name} removed from the project`);
          return res.ok;
        }}
      />
    </section>
  );
}

function AddPeopleDialog({ projectId, projectName, addable, onClose }: { projectId: string; projectName: string; addable: Addable[]; onClose: () => void }) {
  const [selected, setSelected] = useState(new Set<string>());
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add people to {projectName}</DialogTitle>
          <DialogDescription>People who already have an account. To add someone new, use Invite by email.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border py-1">
          {addable.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  setSelected(next);
                }}
                className="accent-[var(--primary)]"
              />
              <span className="truncate">{p.name}</span>
              {p.username && <span className="truncate text-xs text-muted-foreground">@{p.username}</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending || selected.size === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await addProjectMembers(projectId, [...selected]);
                if (res.ok) {
                  toast.success(`Added ${selected.size} ${selected.size === 1 ? "person" : "people"}`);
                  onClose();
                } else toast.error(res.error);
              })
            }
          >
            Add {selected.size > 0 ? selected.size : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
