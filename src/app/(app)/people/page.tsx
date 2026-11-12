import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getPeople } from "@/lib/people";
import { createClient } from "@/lib/supabase/server";
import { PeopleView } from "@/components/people/people-view";

export const metadata: Metadata = { title: "People" };

// Admins only. Members get a "page not found", the same as any page they
// can't open.
export default async function PeoplePage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") notFound();

  const supabase = await createClient();
  const [{ people, pending }, { data: projects }] = await Promise.all([
    getPeople(),
    supabase.from("projects").select("id, name, color, archived_at").order("name"),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 sm:px-8">
      <PeopleView
        meId={user.id}
        people={people}
        pending={pending}
        projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color, archived: Boolean(p.archived_at) }))}
        timezone={user.timezone}
      />
    </div>
  );
}
