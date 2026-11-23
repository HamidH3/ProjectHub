# Outlook calendar

Each person can connect **their own** Outlook calendar. Their Outlook meetings then show:

- on the **Calendar** page (blue, with a refresh button at the top),
- on **Home**, in an "Outlook today" sticky note, or on a project's note if linked to that project,
- on a **project's calendar**, if they've linked the meeting to that project (click a meeting → *Project*).

Clicking a meeting shows its time and place, a **Join Teams meeting** button and **Open in Outlook**.
Outlook meetings are **private to the person who connected them**: teammates and admins never
see them, even when they're linked to a shared project (checked by the database). ProjectHub only
**reads** the calendar and never changes it.

People connect in **Settings → Outlook calendar**, in one of two ways:

| | Sign in with Microsoft (recommended) | Paste a calendar link |
|---|---|---|
| For the person | One button | Three steps in Outlook on the web, then paste |
| Set up by the owner | Once: an app registration in Microsoft Entra (below), free | Nothing |
| Company accounts | Many companies make IT approve new apps first | Only if the company allows "Publish a calendar" |
| Updates | Every 5 minutes while ProjectHub is open, and on Refresh | Same, but Outlook itself may update the link more slowly |
| Teams "Join" button, "Open in Outlook" | Yes | Join button if Outlook includes it; no "Open in Outlook" |

If Sign in with Microsoft isn't set up, Settings shows only the link option.

---

## Before you start: company calendars

A work calendar belongs to the company. Connecting it copies meeting **titles, times, places and
Teams links** into this site's database (Supabase) for that person. **Ask your IT team first.** A
message you can send them is at the end of this page. ProjectHub asks Microsoft for the smallest
calendar permission there is (`Calendars.ReadBasic`), which **excludes meeting bodies, attachments
and attendee lists**.

---

## Setting up "Sign in with Microsoft" (owner, once, free)

You need an **app registration** in Microsoft Entra (Azure AD). There are two ways:

- **A. Your company's IT creates it in the company's own Microsoft tenant** (best for work
  calendars: it's approved and only the company's accounts can use it). Send them steps 1–6.
- **B. You create it in your own Entra directory** (for personal accounts, or any organisation
  whose IT approves it). Microsoft needs a directory to hold the app; with a personal account you
  may be asked to create one.

1. Go to <https://entra.microsoft.com> → **Identity → Applications → App registrations → New registration**.
2. **Name**: `ProjectHub`.
   **Supported account types**:
   - A (one company): *Accounts in this organizational directory only*
   - B (anyone): *Accounts in any organizational directory and personal Microsoft accounts*
3. **Redirect URI**: platform **Web**, address `https://YOUR-SITE/api/outlook/callback`
   (your `SITE_URL` plus `/api/outlook/callback`). Press **Register**.
   To also use it on your computer, add a second Web redirect URI: `http://localhost:3000/api/outlook/callback`
   (Authentication → Add URI).
4. On the app's **Overview**, copy the **Application (client) ID** → `MICROSOFT_CLIENT_ID`.
   For A, also copy the **Directory (tenant) ID** → `MICROSOFT_TENANT`. For B, use `MICROSOFT_TENANT=common`.
5. **Certificates & secrets → New client secret** (24 months). Copy the **Value** (not the
   Secret ID; it's only shown once) → `MICROSOFT_CLIENT_SECRET`. Put a reminder in your calendar to
   make a new one before it expires.
6. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**: tick
   `Calendars.ReadBasic`, `User.Read` (usually already there) and `offline_access`. Press **Add**.
   For A, IT presses **Grant admin consent for <company>** so nobody sees an approval screen.

Then add the three settings where your site runs and redeploy:

- **Vercel**: Settings → Environment Variables (Production): `MICROSOFT_CLIENT_ID`,
  `MICROSOFT_CLIENT_SECRET` (mark Sensitive), `MICROSOFT_TENANT`.
- **Your computer**: the same lines in `.env.local` (or run `npm run setup`).
- **Docker**: `.env.docker`. **Kubernetes**: ID and tenant in `configmap.yaml`, secret in `secret.env`.

`npm run doctor` checks them and prints the exact redirect URI to register.

Nothing else is needed: no new secret key. Sign-in tokens and calendar links are stored encrypted
with a key derived from `SUPABASE_SECRET_KEY`. If you ever change that key, people simply connect
Outlook again.

---

## Connecting (each person)

**Sign in with Microsoft**: Settings → Outlook calendar → **Sign in with Microsoft** → pick your
account → accept. You're back in Settings, and your meetings are on the Calendar.

- *"Need admin approval"*: your company hasn't approved ProjectHub yet. Ask IT (message below), or
  use a calendar link if your company allows it.

**Calendar link**: Settings → Outlook calendar → *Use a calendar link instead*, then:

1. Open Outlook on the web → **Settings** cog → **Calendar → Shared calendars**.
2. Under **Publish a calendar**, pick **Calendar** and **Can view all details** → **Publish**.
3. Copy the **ICS** link (ending in `.ics`) and paste it into ProjectHub → **Connect**.

Keep that link private: anyone with it can see the calendar. To stop sharing, press **Unpublish** in
the same Outlook screen, and **Disconnect** in ProjectHub. If *Publish a calendar* is missing, the
company has turned it off.

**Disconnect** (Settings) deletes the stored sign-in or link and every copied meeting at once.
Signing in with Microsoft while a link is connected replaces the link.

---

## How it works (for developers)

- **Database** (migration 21, `20261124120000_outlook_calendar.sql`):
  - `calendar_connections`: one per person per kind (`microsoft` / `link`), holding the encrypted
    `secret`. People can read their own row **except** `secret` (column grants), and delete it
    (Disconnect). Only the server writes rows.
  - `outlook_events`: a copy of each person's events, a month back to six months ahead. People
    read their own and may only change `project_id`, and only to a project they can open.
  - Both tables have the 2FA rule, and logged-out visitors see nothing.
    `supabase/tests/security-check.sql` tests all of it.
- **Sign in** (`/api/outlook/connect` → Microsoft → `/api/outlook/callback`): OAuth 2.0
  authorisation code with PKCE. The state and verifier are kept in a 10-minute, HttpOnly cookie
  tied to the signed-in person. Microsoft's refresh token is encrypted (AES-256-GCM,
  `lib/outlook/crypto.ts`) and replaced each time Microsoft issues a new one.
- **Refreshing** (`lib/outlook/sync.ts`): pages show the stored copy immediately (no waiting on
  Microsoft). If it's over 5 minutes old, the page asks the server to refresh in the background
  (`refreshOutlook`), then reloads quietly. Microsoft: Graph `calendarView` in UTC, all pages.
  Links: downloaded only from `outlook.office365.com`, `outlook.office.com` or `outlook.live.com`
  (checked again after redirects), 8 MB and 20 s limits. Repeating meetings are expanded with
  `ical.js` (`lib/outlook/ics.ts`). Meetings deleted in Outlook disappear; links to projects survive
  refreshes.
- **Showing**: `lib/outlook/data.ts` loads them alongside the page's other data (in parallel), and
  `lib/outlook/events.ts` puts them in the person's own time zone. All-day events keep their dates.
- **Tests**: `tests/unit/outlook.test.ts` (Microsoft and ICS reading, time zones, link checks).

---

## Problems

| You see | Fix |
|---|---|
| `AADSTS50011` (redirect URI mismatch) | The redirect URI in Entra must be exactly `SITE_URL` + `/api/outlook/callback` (https, no slash at the end) |
| `AADSTS700016` (application not found) | `MICROSOFT_TENANT` is a different organisation than where the app is registered, or the client ID is wrong |
| `AADSTS7000215` (invalid client secret) | You copied the secret's ID, or it expired. Make a new secret and copy its **Value** |
| "Need admin approval" | The company must approve the app (Grant admin consent), or use a calendar link |
| "Outlook needs attention" on the calendar | Settings → Outlook calendar shows why; usually **Reconnect** (password changed, sign-in expired after 90 days unused, or access removed) |
| Link: "doesn't work any more" | The calendar was unpublished. Publish again and paste the new ICS link |
| No "Publish a calendar" in Outlook | Turned off by the company; use Sign in with Microsoft |

---

## Message for your IT team

> Hi, I'd like to see my Outlook calendar inside ProjectHub, a private project-management web app I
> use (hosted on Vercel, data in Supabase, EU/UK region). It would **only read** my own calendar using
> Microsoft's least-privileged delegated permission **Calendars.ReadBasic** (plus User.Read and
> offline_access). That gives meeting titles, times, locations and Teams links, but **not meeting
> bodies, attachments or attendee lists**, and it can't change anything. The copy is visible only to
> me (enforced by database security rules), the sign-in token is stored encrypted, and disconnecting
> deletes everything.
>
> Could you either (a) approve/grant admin consent for the app, or (b) register it in our tenant
> (single-tenant app, redirect URI `https://YOUR-SITE/api/outlook/callback`, delegated
> Calendars.ReadBasic, User.Read and offline_access) and send me the Application (client) ID,
> Directory (tenant) ID and a client secret? Alternatively, is publishing my calendar as an ICS
> link allowed? Thanks!
