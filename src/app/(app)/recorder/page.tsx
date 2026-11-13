import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getSidebarProjects } from "@/lib/projects";
import { getMyRecordings, missingSettings } from "@/lib/meetings/data";
import { RecorderView } from "@/components/meetings/recorder-view";

export const metadata: Metadata = { title: "Meeting recorder" };
// The "Try again" and "Check now" buttons can start a summary, which takes a
// minute or two to write.
export const maxDuration = 300;

// Send the notetaker bot to a Teams, Zoom or Google Meet meeting; afterwards,
// pick which project its AI notes go into.
export default async function RecorderPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Meeting recorder</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Only an administrator can send the meeting bot. Its notes appear under <b>AI notes</b> in each project&apos;s
          Notes tab, where you can read, add to and tidy them.
        </p>
      </div>
    );
  }
  const [recordings, projects] = await Promise.all([getMyRecordings(), getSidebarProjects()]);

  return (
    <RecorderView
      recordings={recordings}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      missing={missingSettings()}
    />
  );
}
