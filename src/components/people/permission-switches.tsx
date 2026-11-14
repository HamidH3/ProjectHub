"use client";

// The on/off switches on the People page for what a member may do beyond
// working in their projects. Admins can always do everything, so they get a
// note instead of switches.
import { useOptimistic, useTransition } from "react";
import { Bot, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setPermission } from "@/actions/members";
import type { Person } from "@/lib/people";

type Key = "createProjects" | "meetingBot";

const SWITCHES: { key: Key; label: string; hint: string; icon: typeof Bot; field: "canCreateProjects" | "canUseMeetingBot" }[] = [
  {
    key: "createProjects",
    label: "Create projects",
    hint: "They can start new projects and are added to them. Switching this off keeps them on the ones they made.",
    icon: FolderPlus,
    field: "canCreateProjects",
  },
  {
    key: "meetingBot",
    label: "Meeting recorder",
    hint: "They see the Meeting recorder and can send the notetaker bot to their meetings (Recall.ai bills per hour).",
    icon: Bot,
    field: "canUseMeetingBot",
  },
];

export function PermissionSwitches({ person }: { person: Person }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useOptimistic(
    { createProjects: person.canCreateProjects, meetingBot: person.canUseMeetingBot },
    (current, change: { key: Key; on: boolean }) => ({ ...current, [change.key]: change.on }),
  );

  if (person.role === "admin") {
    return <p className="text-xs text-muted-foreground">Administrators can create projects and use the meeting recorder.</p>;
  }

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label={`What ${person.name} can do`}>
      {SWITCHES.map(({ key, label, hint, icon: Icon }) => {
        const on = state[key];
        return (
          <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-xs" title={hint}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${label} for ${person.name}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setState({ key, on: !on });
                  const res = await setPermission(person.id, key, !on);
                  if (!res.ok) toast.error(res.error);
                  else toast.success(`${label} ${!on ? "on" : "off"} for ${person.name}`);
                })
              }
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                on ? "bg-primary" : "bg-(--chip)",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block size-4 rounded-full bg-white shadow transition-transform",
                  on ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
            <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className={on ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
