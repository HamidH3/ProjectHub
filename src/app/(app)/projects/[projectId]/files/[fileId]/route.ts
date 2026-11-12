// Opening or downloading a project file.
//   /projects/{project}/files/{file}             → opens it in the browser (PDFs, images, text)
//   /projects/{project}/files/{file}?download=1  → downloads it with its name
// The server checks you're logged in (with 2FA if you use it) and can see the
// file, then sends you to a private storage link that stops working after
// 60 seconds. The bucket itself is never public.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/audit";
import { BUCKET } from "@/lib/file-types";
import { projectIdSchema } from "@/lib/validation/project";

const LINK_SECONDS = 60;

function notFound() {
  return new NextResponse("File not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/projects/[projectId]/files/[fileId]">) {
  const { projectId, fileId } = await ctx.params;
  if (!projectIdSchema.safeParse(projectId).success || !projectIdSchema.safeParse(fileId).success) return notFound();

  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("id, project_id, storage_path, name")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!file) return notFound();

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, LINK_SECONDS, download ? { download: file.name } : undefined);
  if (error || !data?.signedUrl) return notFound();

  if (download) {
    await logActivity({
      actorId: user.id,
      action: "file.downloaded",
      projectId: file.project_id,
      entityType: "file",
      entityId: file.id,
      metadata: { name: file.name },
    });
  }

  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
