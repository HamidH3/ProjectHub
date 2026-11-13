// Claude reads this to find out how to sign in (RFC 9728).
import { protectedResource } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";
export const GET = protectedResource;
