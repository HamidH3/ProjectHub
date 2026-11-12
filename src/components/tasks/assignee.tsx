"use client";

// Who a to-do is for: the badge on each to-do, and the "Assign to" pickers.
import { assignableFor, initials } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useSchedule } from "@/components/tasks/schedule-context";

// A round badge with someone's initials. Yours is orange so it stands out.
export function Avatar({ name, mine, className }: { name: string; mine: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
        mine ? "bg-primary text-primary-foreground" : "bg-[#e8e8e8] text-[#1a1a1a]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// "For you" / "For Sanna" on a to-do. Nothing when it isn't assigned.
export function AssigneeBadge({ assigneeId }: { assigneeId: string | null }) {
  const { personOf, meId } = useSchedule();
  if (!assigneeId) return null;
  const person = personOf(assigneeId);
  const mine = assigneeId === meId;
  const name = person?.name ?? "Someone";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium",
        mine ? "bg-primary/20 text-[#ffb59a]" : "bg-black/30 text-foreground",
      )}
    >
      <Avatar name={name} mine={mine} className="size-[18px]" />
      <span className="truncate">{mine ? "For you" : `For ${name}`}</span>
    </span>
  );
}

// The "Assign to" drop-down: nobody, you, then everyone else on the project.
export function AssigneeSelect({
  projectId,
  value,
  onChange,
  id,
  className,
  emptyLabel = "Nobody in particular",
}: {
  emptyLabel?: string;
  projectId: string;
  value: string;
  onChange: (id: string) => void;
  id?: string;
  className?: string;
}) {
  const { team, meId } = useSchedule();
  const people = assignableFor(team, projectId, meId);
  return (
    <select
      id={id}
      aria-label={id ? undefined : "Assign to"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring",
        className,
      )}
    >
      <option value="">{emptyLabel}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.id === meId ? `Me (${p.name})` : p.isAdmin ? `${p.name} (admin)` : p.name}
        </option>
      ))}
    </select>
  );
}
