import { colorOf } from "@/lib/project-colors";
import { cn } from "@/lib/utils";

// The small coloured square that marks each project.
export function ProjectDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)}
      style={{ backgroundColor: colorOf(color).dot }}
    />
  );
}
