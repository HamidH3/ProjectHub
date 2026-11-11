import type { Metadata } from "next";
import { ComingSoon } from "@/components/projects/coming-soon";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <ComingSoon
      title="Tasks & to-do"
      description="Quick-add to-dos grouped by day, with priorities, due times, overdue and completed views."
    />
  );
}
