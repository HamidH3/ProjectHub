import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fromGraph, type GraphEvent, type OutlookRow, MAX_EVENTS } from "@/lib/outlook/events";

// "Sign in with Microsoft" for Outlook calendars (OAuth 2.0 with PKCE, Microsoft
// identity platform v2). Only reads calendars, and only the basics: times,
// titles, places and Teams links, never meeting bodies or attachments
// (Calendars.ReadBasic). Setup: docs/OUTLOOK-CALENDAR.md.

export const MICROSOFT_SCOPES = "offline_access User.Read Calendars.ReadBasic";
// Stand-ins for Microsoft can be used in tests (never in production).
const testing = process.env.NODE_ENV !== "production";
const GRAPH = (testing && process.env.MICROSOFT_GRAPH_URL) || "https://graph.microsoft.com/v1.0";

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim());
}

function tenant(): string {
  const t = process.env.MICROSOFT_TENANT?.trim() || "common";
  // A tenant ID (GUID), a domain, or common / organizations / consumers.
  if (!/^[a-zA-Z0-9.-]{1,100}$/.test(t)) throw new Error("MICROSOFT_TENANT isn't valid.");
  return t;
}
const loginBase = () =>
  `${(testing && process.env.MICROSOFT_LOGIN_URL) || "https://login.microsoftonline.com"}/${tenant()}/oauth2/v2.0`;

export function newSignInRequest(redirectUri: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${loginBase()}/authorize`);
  url.search = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!.trim(),
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, verifier };
}

type Tokens = { access: string; refresh: string };

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${loginBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!.trim(),
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!.trim(),
      scope: MICROSOFT_SCOPES,
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    // e.g. invalid_grant: the sign-in has expired or was revoked.
    throw new MicrosoftError(data.error ?? `http_${res.status}`);
  }
  return { access: data.access_token, refresh: data.refresh_token };
}

export class MicrosoftError extends Error {
  constructor(public code: string) {
    super(`Microsoft sign-in failed (${code})`);
  }
  /** The person needs to sign in again (expired, revoked or password changed). */
  get needsReconnect() {
    return ["invalid_grant", "interaction_required", "consent_required", "unauthorized_client"].includes(this.code);
  }
}

export function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
}

export function refreshTokens(refresh: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
}

async function graph<T>(access: string, url: string): Promise<T> {
  const res = await fetch(url.startsWith(`${GRAPH}/`) ? url : `${GRAPH}${url}`, {
    headers: { authorization: `Bearer ${access}`, prefer: 'outlook.timezone="UTC"' },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new MicrosoftError("interaction_required");
  if (!res.ok) throw new MicrosoftError(`graph_${res.status}`);
  return (await res.json()) as T;
}

/** The account's email, to show which account is connected. */
export async function accountLabel(access: string): Promise<string | null> {
  const me = await graph<{ mail?: string | null; userPrincipalName?: string | null }>(
    access,
    "/me?$select=mail,userPrincipalName",
  );
  return (me.mail || me.userPrincipalName || "").slice(0, 200) || null;
}

/** Every event (repeating meetings expanded) between from and to. */
export async function calendarEvents(access: string, from: Date, to: Date): Promise<OutlookRow[]> {
  const select = "id,subject,start,end,isAllDay,isCancelled,location,onlineMeeting,webLink";
  let next: string | undefined =
    `/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
    `&$select=${select}&$top=250&$orderby=start/dateTime`;
  const rows: OutlookRow[] = [];
  // Only Microsoft's own "next page" links are followed.
  while (next && rows.length < MAX_EVENTS) {
    const page: { value?: GraphEvent[]; "@odata.nextLink"?: string } = await graph(access, next);
    for (const ev of page.value ?? []) {
      const row = fromGraph(ev);
      if (row) rows.push(row);
    }
    const link = page["@odata.nextLink"];
    next = link && link.startsWith(`${GRAPH}/`) ? link : undefined;
  }
  return rows.slice(0, MAX_EVENTS);
}
