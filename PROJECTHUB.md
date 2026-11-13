# ProjectHub: everything you need to know

> **For Claude (or any developer) reading this:** this is the complete guide to
> ProjectHub, a private project-management and personal-CRM web app. Read it
> fully before suggesting changes. Follow the "Rules for changing the code" and
> "Security model" sections: they record decisions that were made on purpose.
> Never ask for, print or commit passwords, the Supabase secret key or other
> secrets.

Owner: **Hamid Hafiz** (GitHub `HamidH3`, admin username in the app `hamidh3`).
Last updated: 13 November 2026 (Claude connector).

---

## 1. What it is

A private, invite-only web app for keeping every project in one place:

- **Projects** with a colour, status, dates, archive/restore.
- **Home page**: greeting, "Start new project", project cards, and **paper sticky notes** with
  today's to-dos and meetings for each project (tick them off right there), plus an "Overdue" note.
- **Notes** (OneNote-style), on **light paper with black writing** in every theme:
  - rich text editor, nested subpages, drag-and-drop to reorder, hold on a note to put another
    inside it, drag left/right to change level, autosave
  - **everyone has their own notes**: "My notes" (yours, editable) at the top, then a view-only
    section per person ("Sanna's notes"); others' notes open read-only (`note-viewer.tsx`)
  - **drawing**: Type / Pen / Highlighter / Eraser / Select tools; drag to move, drag a box to
    pick several, Delete, resize pictures from the corner, bring to front / send to back,
    duplicate, copy and paste. Everything stays on the paper (the page grows downwards)
  - **screenshots and pictures**: paste with Ctrl+V, drop, or "Add a picture" (PNG/JPG, 10 MB)
  - **one undo for everything**: Ctrl+Z / Ctrl+Y undo and redo the last change, text or drawing
  - **keyboard**: T/P/H/E/S pick tools, Esc leaves the text or goes back to typing, ? lists all
    shortcuts; with Select also Ctrl+A, arrows to nudge, Ctrl+C/X/V/D, ] and [
  - a status bar shows the current tool; screen readers hear what happens; the drawing toolbar
    never wraps and shows ‹ › arrows when it doesn't fit
  - code: `lib/drawing.ts` (tested), `components/notes/drawing-layer.tsx`, `draw-toolbar.tsx`,
    `drawing-help.tsx`, `scroll-row.tsx`
- **To-dos**: grouped Overdue / Today / Tomorrow / each weekday / Later / No day; quick add;
  priority and time; tick off with Undo; Completed view. **Assign to** anyone on the project
  (members and admins): each to-do shows "For you" / "For Sanna", "Added by …" in the editor, and
  an **Everyone / For me** filter. Open to-dos sit on a card tinted with the project's colour.
- **Calendar**: month view per project and across all projects; **meetings** (day, from/to
  time or all-day, place/link, notes).
- **Files**: private uploads (PDF, Word, Excel, CSV, PowerPoint, text, PNG, JPG, ZIP; max 50 MB),
  folders inside folders, drag to move, rename, preview images, open/download.
- **People** (admins): invite by email, choose each person's projects, make admin/member,
  password reset links, remove people. Each project's **Members** tab shows who can open it.
- **Colour themes** (Settings → Appearance): Dark (default), Light, Black, Purple (like OneNote),
  Blue (like Word), Match my device. Remembered per device in the `ph-theme` cookie (no database
  change); colours are CSS variables in `src/app/theme.css` (`lib/theme.ts` has the list).
- **Claude connector**: people can use ProjectHub from Claude ("what's due today?", "add a to-do for
  Sanna"). Claude signs in as that person and sees only what they can see. See section 15.
- **Search everything** (Ctrl+K or "/"): projects, notes (with highlighted snippets), to-dos,
  meetings and files.
- **Security**: invite-only, 2FA (authenticator app) required for admins, database-level access
  rules on every table, private file storage.

Default dark theme: background `#111111`, sidebar `#191919`, panels `#202020`, orange accent `#d97757`.

---

## 2. Where everything lives

| What | Where | Notes |
|---|---|---|
| **Live app** | https://project-hub-five-psi.vercel.app | Production |
| **Code** | GitHub `HamidH3/ProjectHub` (private) | `main` branch deploys automatically |
| **Code on my laptop** | `C:\Users\hamid\dev\projecthub` | NOT in OneDrive (sync breaks `node_modules`) |
| **Hosting** | Vercel: team "hh's projects", project **project-hub**, Hobby (free) plan | Server code runs in London (`lhr1`) via `vercel.json` |
| **Database, logins, file storage** | Supabase organisation **HamidH3**, Free plan | Two projects, below |
| Supabase **dev** | **projecthub-dev**, ref `tswrxiqnsxxfppitohkx` | Used by `npm run dev` on the laptop; test data |
| Supabase **prod** | **projecthub-prod**, London, ref `jbobiprzbnqmblytqmid` | Used by the live site; real data |
| **Email** | Gmail SMTP with an app password (or Resend) | Set up in section 5, "Email" |
| Secrets | Password manager | `.env.local` copy, DB passwords, setup tokens |
| Claude project notes | `claude/projecthub-build-decisions.md` in the PersonalCRM Claude project | Detailed build log |

### Dev and prod, in plain words

Two **separate** Supabase projects that share nothing (no data, no accounts). **Dev** is the
practice copy used by `npm run dev`; **prod** is the real one used by the live site. They're kept
the same shape by the files in `supabase/migrations/`: every database change is pushed to dev
first, checked, then pushed to prod. To look at the data: Supabase dashboard → the project →
**Table Editor** (be careful editing rows in prod: the app's rules don't stop you there).

### Free-plan limits (chosen on purpose for now)

- **Supabase Free**: 2 active projects (dev + prod use both). A project is **paused after 1 week
  without activity**: the site stops working until you click **Restore** in the Supabase dashboard
  (data is kept). **No downloadable backups**: keep copies of important files elsewhere.
- **Vercel Hobby**: for **personal, non-commercial use only**. Company/commercial use needs
  Vercel Pro; also check the employer's policy before putting company data in.

---

## 3. Tech stack

| Part | What | Version |
|---|---|---|
| Framework | Next.js (App Router, TypeScript, `src/` folder, Turbopack) | 16.4 |
| UI | React, Tailwind CSS 4, shadcn/ui (Radix, "Nova" preset), lucide-react icons, sonner toasts, Geist font | React 19.3 |
| Backend | Supabase: Postgres, Auth (with 2FA), Storage | `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.119 |
| Supabase CLI | migrations and types | 3.1 (dev dependency, run with `npx supabase`) |
| Notes editor | TipTap: **all six @tiptap packages must be the same exact version** | 3.33.1 |
| Drag and drop | dnd-kit (core, sortable, utilities, modifiers) | core 6.3 |
| Ordering | fractional-indexing (sortable text keys) | |
| Validation | Zod | 4 |
| Dates | date-fns, plus our own `lib/days.ts` | |
| Email | Gmail SMTP via **Nodemailer 10** (preferred), or Resend REST API as a fallback | `src/lib/email.ts` |
| Drawing on notes | Our own SVG layer (no drawing library); pictures in Supabase Storage | `src/lib/drawing.ts` |
| Themes | CSS variables per theme, chosen with a cookie (no database) | `src/app/theme.css`, `src/lib/theme.ts` |
| Tests | Vitest | 5 (needs `@types/node` 22) |
| Hosting | Vercel | |
| Containers | Docker, Kubernetes manifests (for hosting elsewhere) | |
| Laptop | Windows, PowerShell, VS Code, Node 22, Git | Node v22.15 |

Next.js 16 notes: middleware is now **`src/proxy.ts`**; **Cache Components is switched off**
(every page is private to the logged-in user).

---

## 4. Folder structure (the important parts)

```
projecthub/
├─ PROJECTHUB.md                ← this file
├─ TESTING.md                   ← how to test (automated + click-through checklist)
├─ Dockerfile, .dockerignore, docker-compose.yml, .env.docker.example   ← containers
├─ deploy/kubernetes/           ← Kubernetes manifests (kustomize)
├─ vercel.json                  ← runs on Vercel in London
├─ next.config.ts               ← security headers; standalone output for Docker
├─ vitest.config.mts, tests/unit/*.test.ts   ← automated tests
├─ .github/workflows/checks.yml ← GitHub runs the checks on every push
├─ supabase/
│  ├─ migrations/               ← the 14 database changes, applied in order
│  └─ tests/security-check.sql  ← paste into Supabase SQL Editor to test the rules
└─ src/
   ├─ proxy.ts                  ← runs before every page: refreshes the login, sends logged-out people to /login
   ├─ app/
   │  ├─ mcp/route.ts           ← the Claude connector's address (section 15)
   │  ├─ .well-known/           ← "how to sign in" documents for the connector
   │  ├─ layout.tsx, theme.css  ← sets the colour theme (cookie ph-theme) before anything is drawn
   │  ├─ (auth)/                ← login, setup, mfa, forgot-password, update-password, welcome, oauth/consent,
   │  │                           invite/[code] (invite links), continue (reset links)
   │  ├─ auth/confirm/          ← old-style email links: forwards them to /continue
   │  ├─ auth/signout/          ← signs out removed accounts
   │  └─ (app)/                 ← logged-in area (loading.tsx files show placeholders instantly)
   │     ├─ page.tsx            ← home (cards + sticky notes)
   │     ├─ calendar/, people/, settings/
   │     └─ projects/[projectId]/  ← overview, notes, tasks, calendar, files (+ [fileId] open/download route), members
   ├─ actions/                  ← server actions: auth.ts, projects.ts, members.ts
   ├─ components/               ← auth, calendar, files, home, layout, notes, people, projects, search, settings, tasks, ui
   │  └─ notes/                 ← editor, viewer, tree, other-notes, drawing-layer, draw-toolbar, drawing-help, scroll-row
   ├─ lib/
   │  ├─ supabase/              ← client.ts (browser), server.ts (pages), admin.ts (SECRET key, server only), proxy.ts
   │  ├─ auth.ts                ← getCurrentUser(): login, 2FA and password-change checks for every page
   │  ├─ validation/            ← Zod rules (auth, project, members)
   │  ├─ days.ts, schedule.ts, file-types.ts, search.ts, note-tree.ts, drawing.ts, invite-code.ts ← pure helpers (unit-tested)
   │  ├─ theme.ts               ← the list of colour themes
   │  ├─ mcp/                   ← Claude connector: protocol.ts, tools.ts, auth.ts, metadata.ts, words.ts
   │  ├─ tasks.ts, files.ts, notes.ts, projects.ts, people.ts            ← server-side data loading
   │  ├─ email.ts, rate-limit.ts, audit.ts, request.ts (getSiteUrl), paths.ts (safeNextPath)
   └─ types/database.ts         ← generated from the database (don't edit by hand)
```

---

## 5. Settings (environment variables)

On the laptop these are in **`.env.local`** (never committed; keep a copy in the password manager).
On Vercel: **Settings → Environment Variables**, ticked for **Production** only.

| Name | What | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | No (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | No (public) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`, bypasses all database rules; server only | **Yes** |
| `SETUP_TOKEN` | 32+ random characters for the one-time `/setup` page; delete after the first admin exists | **Yes** |
| `SITE_URL` | The app's address, no trailing slash (used in email links). Required in production | No |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | Email sending, e.g. `smtp.gmail.com`, `465`, your Gmail address (see "Email" below) | No |
| `SMTP_PASSWORD` | Gmail **app password** (16 letters), never your normal Gmail password | **Yes** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Alternative to SMTP (only used if the SMTP settings are missing) | Key: **yes** |

### Email (invites and password resets)

The app emails invites, "New sign-up link" renewals, resends and password resets **automatically**.
Emails **don't name or show the admin** who sent them: the sender name is just "ProjectHub",
there's no Reply-To, and the text says "You have been invited…". The only address shown is the
sending Gmail (`SMTP_USER`), so use a dedicated Gmail rather than a personal one. The People page shows a green banner when email is set up
and a yellow one when it isn't (then links are shown to copy by hand instead).

Gmail setup (free):
1. Google Account → **Security** → turn on **2-Step Verification**.
2. Go to <https://myaccount.google.com/apppasswords>, name it `ProjectHub`, copy the 16-letter password
   (store it in the password manager).
3. Add `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<the Gmail address>`,
   `SMTP_PASSWORD=<app password, no spaces>` to `.env.local` and to Vercel (Production; mark
   `SMTP_PASSWORD` Sensitive), then redeploy.
- Gmail sends as the Gmail account in `SMTP_USER`, with "ProjectHub" as the display name.
  A separate Gmail just for ProjectHub keeps your personal address private. Gmail's limit is ~500 emails/day.
- To revoke: delete the app password in Google; email stops and the banner turns yellow.
- Port 465 = TLS from the start; any other port (587) uses STARTTLS, which is required.

Make a new random token in PowerShell:
```powershell
$b = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

---

## 6. Commands (PowerShell, in `C:\Users\hamid\dev\projecthub`)

| Task | Command |
|---|---|
| Run locally (uses **dev** database) | `npm run dev` → http://localhost:3000 |
| All automated checks | `npm run check` (types + lint + 112 tests) |
| Tests only / re-run on save | `npm test` / `npm run test:watch` |
| Apply database changes to the **linked** project | `npx supabase db push --remote` (**always `--remote`**) |
| See which migrations are applied | `npx supabase migration list --remote` |
| Refresh the TypeScript database types | `npx supabase gen types typescript --remote \| Out-File -Encoding utf8 src\types\database.ts` |
| Point the CLI at **prod** | `npx supabase link --project-ref jbobiprzbnqmblytqmid` (asks for prod's database password) |
| Point it back at **dev** (always do this after) | `npx supabase link --project-ref tswrxiqnsxxfppitohkx` |
| Copy a file to paste into the SQL Editor | `Get-Content supabase\tests\security-check.sql -Raw -Encoding UTF8 \| Set-Clipboard` (paste into **+ → Create a new snippet**) |
| Unzip files Claude sends | `Expand-Archive -Path $HOME\Downloads\<file>.zip -DestinationPath . -Force` |
| Save and deploy | `git add .` → `git commit -m "…"` → `git push` |

Never use `npm install --force` or `--legacy-peer-deps`. If npm reports ERESOLVE, find the real
cause. Examples: TipTap packages on different versions (uninstall all six, reinstall all six at
one version); Vitest needing `@types/node@22`.

---

## 7. How to release a change

1. Make the change locally and try it with `npm run dev` (dev database).
2. `npm run check` must pass.
3. If the change adds a file in `supabase/migrations/`:
   - push it to **dev**: `npx supabase db push --remote` and regenerate types
   - then link **prod**, run `npx supabase db push --remote`, and **link back to dev**
   - run `supabase/tests/security-check.sql` on prod (should say ALL CHECKS PASSED)
4. `git add .`, `git commit -m "…"`, `git push`. Vercel rebuilds and updates the live site in a
   minute or two; GitHub Actions runs the checks (tick or cross next to the commit).

---

## 8. Security model (don't weaken these)

- **Invite-only.** Supabase "Allow new users to sign up" is **off**. New people only come in
  through an admin's invite.
- **Invite links** are ProjectHub's own: `/invite/<43-character random code>`, valid **7 days**
  and until the person has chosen a username and password. Only a SHA-256 fingerprint of the code
  is stored. **Opening a link never uses it**: the page shows a **Continue** button, and only
  pressing it confirms the email and signs the person in (server action `acceptInvite`). This is
  because Outlook Safe Links, Teams/WhatsApp previews and email scanners open links
  automatically; the first version used the one-time code on opening, so scanners "used" invites
  and people saw "link expired" (fixed 12 Nov 2026). Password reset links work the same way via
  `/continue`. A person stuck half-way shows "Hasn't finished signing up" on the People page
  with **⋯ → New sign-up link**; old-style pending invites show "Old link: click Resend". The first admin was created once through `/setup` with `SETUP_TOKEN`.
  No passwords are hardcoded anywhere.
- **Roles**: `admin` (sees everything, manages people and projects) and `member` (only projects
  they're added to). A person's role and projects come **only** from the invitation, never from
  anything they can type. Nobody can change their own role, so there's always an admin.
- **2FA**: required for admins. For anyone who has set it up, the **database itself** hides
  everything until the code is entered (a restrictive rule checking `aal2`).
- **Row Level Security (RLS)** on every table: the database decides what each person can read
  or change, not just the screens. Logged-out visitors (`anon`) have no access to any table.
  Helper functions live in the `private` schema.
- **Files**: private bucket `project-files`, 50 MB, 12 allowed types. Stored at
  `{project_id}/{file_id}/{readable name}`. Opening/downloading goes through
  `/projects/{id}/files/{fileId}`: the server checks access, then redirects to a link that
  expires after 60 seconds. Downloads are logged.
- **Secret key** (`SUPABASE_SECRET_KEY`) is used only in `lib/supabase/admin.ts` (import guarded
  by `server-only`), for: setup, username lookup at login, rate limits, the activity log,
  invites/resets, and removing users. Every caller checks permissions first.
- **Rate limits** (stored in Postgres) on login, setup, password reset and invites.
- **Activity log** (`activity_logs`) is written only by the server; it can't be forged.
- **Own notes**: everyone on a project can read all its notes, but only the writer can change them,
  including their drawing (enforced by the database, not just the screen).
- **Note pictures** are stored in the same private bucket at `{project}/note-images/{note}/…` and
  shown through signed links that expire after an hour.
- **Claude connector** (`/mcp`): every request needs a valid access token from Supabase's OAuth
  server; tools run through a Supabase client carrying **that person's** token, so RLS applies exactly
  as on the website (never the secret key). People must be fully signed in (with 2FA) to press
  Allow. No delete tools. 300 tool calls per person per 10 minutes. Disconnect in Settings.
- **Theme cookie** (`ph-theme`) only holds a colour name; it's checked against the list and never
  trusted for anything else.
- **Assigning to-dos**: anyone on a project can assign its to-dos to anyone else on it. The
  database refuses an assignee who can't open the project, and unassigns people taken off it.
  "Added by" (`created_by`) is set by the database, so it can't be faked. Admins' names are visible
  to every signed-in person (so members can assign to them); other people's only to teammates.
- **Email links** are built from `SITE_URL`, never from the request's address (a faked "Host"
  header could otherwise point a real link at another site).
- **Redirects after login** (`?next=`) go through `safeNextPath()`: same-site paths only;
  control characters and backslashes are refused.
- **Security headers** (`next.config.ts`): no framing, nosniff, strict referrer, permissions
  policy, a basic CSP, HSTS in production.
- **Removed accounts** are signed out on their next click (`/auth/signout?reason=removed`).
- **Proof**: `supabase/tests/security-check.sql` runs 52 checks of these rules on the real
  database and rolls everything back.

---

## 9. Database

14 migrations in `supabase/migrations/`, applied in order:

1. `20261111220000_schema.sql`: tables, enums, triggers (new user → profile; role and projects from the invitation)
2. `20261111220100_security.sql`: RLS on everything, 2FA rule, logged-out lockout, rate-limit function
3. `20261111220200_storage.sql`: the private `project-files` bucket and its rules
4. `20261111230000_private_helpers.sql`: moves helper functions into the `private` schema
5. `20261112000000_note_preview.sql`: `notes.preview` (first 160 characters)
6. `20261112120000_meetings.sql`: `meetings`
7. `20261112130000_folders.sql`: `folders`, `files.folder_id`
8. `20261112140000_readable_file_names.sql`: readable storage names; `file_overview` view
9. `20261112150000_invitation_tracking.sql`: invitation `user_id`, `last_sent_at`, `full_name`
10. `20261112160000_global_search.sql`: `search_everything()` and search columns
11. `20261112180000_invite_links.sql`: `invitations.token_hash` (fingerprint of the invite link code)
12. `20261112200000_task_assignees.sql`: assigning to-dos (assignee must be able to open the project;
    unassigned when taken off it; everyone signed in can see admins' names)
13. `20261112210000_personal_notes.sql`: own notes (only the writer, `created_by`, can edit/move/
    delete a note; admins can tidy up notes whose writer's account is gone; subpages must have the
    same writer as their parent)
14. `20261113120000_note_drawings.sql`: `notes.drawing` (ink and pictures as JSON, max 3 MB);
    pictures are stored at `{project}/note-images/{note}/…` in the private bucket

**Tables**: `profiles`, `projects`, `project_members`, `notes`, `tasks`, `meetings`, `files`,
`folders`, `invitations`, `activity_logs`, `project_views`, `app_settings`, `rate_limits`.
**View**: `file_overview` (every file with project, folder path, real name, size, uploader:
open it in Supabase's Table Editor). **Function**: `search_everything(query, limit)`.

Important: the first tables rely on Supabase's **"Automatically expose new tables"** setting
(ON) for their permissions. Keep it ON when creating a new Supabase project for this app.
**"Enable Data API"** must also be ON.

---

## 10. Rules for changing the code (lessons learned)

- Pure logic goes in plain `src/lib/*.ts` files with a test in `tests/unit/`; server data loading
  goes in `server-only` files; don't export non-component values from `"use client"` files.
- Never call `supabase.auth.getSession()` or `getAuthenticatorAssuranceLevel()` on the server:
  use `getClaims()` (and `getUser()` only for the 2FA factor list).
- Every dnd-kit `<DndContext>` needs a fixed `id` prop (otherwise hydration errors).
  The notes tree uses a "stable gap" sortable-tree design (`components/notes/note-tree.tsx`);
  tuning knobs `NEST_DELAY_MS` (250) and `LEVEL_DRAG_PX` (32).
- Hover-only menus need `[@media(hover:none)]:opacity-100` so phones can use them.
- Long user text needs `[overflow-wrap:anywhere]` and `min-w-0` on its parents.
- Search highlights (⟦ ⟧ markers) are rendered as text, never as HTML.
- **Colours**: never hard-code a hex colour in a screen; use the theme variables (`bg-card`,
  `text-muted-foreground`, or the extras like `bg-(--hover)`, `text-(--ok)`, `bg-(--paper)`), so
  every theme works. Add new colours to every theme block in `theme.css`.
- Drawings are stored in page units (the page is always 800 units wide) and scaled to the screen.
- New tables: add RLS, the 2FA restrictive rule, revoke `anon`, grant `authenticated`, and add
  checks to `security-check.sql`.
- After adding a migration, regenerate `src/types/database.ts`.
- ESLint includes React Compiler rules: `useCallback` dependencies must be whole values.
- **Fast taps:** `loading.tsx` files in `(app)/`, `projects/[projectId]/` and `.../notes/` make every
  tap show a placeholder at once, and let Next.js fetch each page's frame ahead of time (it skips
  pages that have none). New sections need to sit under one of them. Keep independent database
  calls in `Promise.all` (as in `getCurrentUser()`), not one after another.
- **Don't switch on `experimental.staleTimes`** (keeping visited pages in memory): notes, to-dos and
  files are saved straight from the browser, so a kept page would show old content and the notes
  editor could save over newer text.

---

## 11. Testing

See **TESTING.md**. In short:
1. `npm run check` before every push (also runs on GitHub).
2. `supabase/tests/security-check.sql` in the SQL Editor after database changes (dev, then prod).
3. The click-through checklist in TESTING.md before big releases, with a test member account.

---

## 12. Known limits and ideas

**Known**
- Two people editing the same note at once: the last save wins.
- Opening a note that contains a table triggers one harmless extra save.
- Files uploaded before migration 8 are stored as `{project}/{file id}` (no name) until renamed.
- Storage doesn't mirror ProjectHub folders (on purpose; folder paths are in `file_overview`).
- Note pictures follow the bucket's project-wide rule: anyone on the project could technically
  delete one through the API (the note itself, and its drawing, are still writer-only).
- Claude connector: Supabase's OAuth server is in **beta**. Its docs don't say whether connector
  tokens carry the two-step sign-in level (`aal2`); if they don't, people **with 2FA set up** get a
  clear "two-step sign-in" message from the connector instead of data (the 2FA database rule was
  deliberately not weakened). People without 2FA are unaffected.
- Drawings scale with the page width, but text re-wraps on narrow screens, so ink drawn next to a
  line of text can sit slightly off it on a phone (OneNote has the same trade-off).

**Ideas offered, not built yet**: drag to-dos between days; repeating to-dos and meetings;
email people when a to-do is assigned to them; Outlook calendar (private subscribe link, "Add to Outlook" .ics, or
full Microsoft 365 sync, which needs company IT approval); custom domain (also lets email come
from your own address);
an explicit-permissions migration so "Automatically expose new tables" could be turned off.

---

## 13. Running it elsewhere (Docker / Kubernetes): e.g. for a buyer

The app itself holds nothing on its own disk: all data (including note drawings and pictures) is
in Supabase. So moving it means: **a Supabase project** (theirs) + **the app container**
(anywhere) + **HTTPS** in front + optionally **an email account** for invites.

Checked 13 November 2026 with every feature above: the image builds, runs read-only with no extra
Linux permissions, its health check reports healthy, logged-out visitors are sent to /login, and
the colour theme is picked up from the cookie.

### 13.1 Their own Supabase

1. Create a Supabase project (supabase.com, any region; keep **Data API** and **Automatically
   expose new tables** ON; automatic RLS optional).
2. Apply all 14 migrations: `npx supabase link --project-ref <their-ref>` then
   `npx supabase db push --remote`.
3. Authentication settings: sign-ups **off**, Site URL = their address, Redirect URLs =
   `https://their-address/**`, Email OTP expiry 86400.
4. Run `supabase/tests/security-check.sql` in their SQL Editor → ALL CHECKS PASSED.
5. Claude connector (optional): Authentication → OAuth Server → enable, Authorization Path
   `/oauth/consent`, allow dynamic registration (section 15).
6. Email (optional): a Gmail with an app password (section 5, "Email"), or Resend. Without it the
   app still works; invite links are shown to copy by hand.

Self-hosted Supabase (their own servers, using Supabase's official Docker setup) also works.
Point `NEXT_PUBLIC_SUPABASE_URL` at it, use its anon/service-role keys in the two key
variables, and push the migrations with `npx supabase db push --db-url <postgres-url>`.

### 13.2 Docker (one server)

The two **public** Supabase values are built into the browser code, so build one image per
Supabase project. Secrets are only given when it runs.

```bash
cp .env.docker.example .env.docker      # fill it in (never commit it)
docker compose --env-file .env.docker up -d --build
# → http://localhost:3000
```
Or by hand:
```bash
docker build -t projecthub \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://REF.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... .
docker run -d -p 3000:3000 --env-file .env.docker --read-only \
  --tmpfs /tmp --tmpfs /app/.next/cache --cap-drop ALL projecthub
```
`.env.docker` holds the secrets: `SUPABASE_SECRET_KEY`, `SITE_URL`, and the email settings
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`). The server must be allowed to make
outgoing connections to Supabase (HTTPS, 443) and, for email, to the mail server (465 for Gmail).

Put HTTPS in front (e.g. Caddy, nginx, a cloud load balancer). The app sends HSTS, so it must be
served over HTTPS in production. The image runs as a non-root user, contains no source code or
`.env` files, needs write access only to `/app/.next/cache` and `/tmp`, and has a health check on
`/login`.

### 13.3 Kubernetes

Files in `deploy/kubernetes/` (namespace with "restricted" pod security, ConfigMap, Secret from
`secret.env`, Deployment with 2 replicas and probes, Service, Ingress with HTTPS via
cert-manager, PodDisruptionBudget).

1. Build and push the image to a registry, e.g.
   `docker build -t ghcr.io/NAME/projecthub:1.0.0 --build-arg ... .` then `docker push …`.
2. Edit `kustomization.yaml` (image name), `configmap.yaml` (`SITE_URL`), `ingress.yaml` (host,
   cert-manager issuer).
3. `cp deploy/kubernetes/secret.env.example deploy/kubernetes/secret.env` and fill it in (it is
   git-ignored).
4. `kubectl apply -k deploy/kubernetes`, then `kubectl -n projecthub get pods`.

`secret.env` holds the same secrets as `.env.docker` (including the SMTP settings). If the cluster
uses NetworkPolicies, allow outgoing traffic to Supabase (443) and the mail server (465).
Several copies can run at once: rate limits, logins, notes and drawings all live in Supabase, and
the colour theme is a cookie in each person's browser.

### 13.4 Handing it over / selling

- Give them the **code** (a new GitHub repo or a zip), **not** your `.env.local`, keys, or database.
- They create **their own** Supabase project, Vercel/server and (optionally) their own email account,
  following 13.1 to 13.3. They start with an empty database and make their first admin through
  `/setup` with their own `SETUP_TOKEN`.
- If they'll use Vercel for a business, that's the Pro plan; Supabase Pro removes the weekly pause
  and adds backups.
- The libraries used are under permissive open-source licences (Next.js, React, Supabase
  libraries, TipTap core, shadcn/ui, dnd-kit, Zod: MIT; Nodemailer: MIT-0; lucide: ISC; Geist font: SIL OFL;
  lightningcss (build tool only): MPL-2.0), which allow commercial use. Keep their licence
  notices.
- Before selling, check your employment contract to confirm you own what you built (some
  contracts claim work made while employed), and use a written agreement/licence for the sale.
  This is general information, not legal advice.

---

## 14. Build history (short)

All built 6–13 November 2026 with Claude, step by step:

1. Architecture and accounts → Supabase schema and security → login, setup, 2FA
2. Projects and home → notes (tree, drag and drop, autosave) → to-dos, calendar, meetings, sticky notes
3. Files and folders (readable storage names) → people and invites → search everything
4. Testing (unit tests, database security check, GitHub checks; found and fixed a redirect hole)
5. Deployment (Supabase prod in London, Vercel) → Docker and Kubernetes
6. Invite links that survive link scanners (Continue button, 7-day codes) → automatic invite
   emails (Gmail SMTP) that don't name the admin
7. Instant taps (loading screens, faster login check)
8. Assigning to-dos to people, brighter to-do cards → everyone's own notes (view-only for others)
9. Colour themes, light note paper, drawing and screenshots on notes → drawings stay on the
   paper, one undo for text and drawing, keyboard shortcuts and screen-reader support

10. Claude connector (MCP) with sign-in through Supabase's OAuth server, an approval page and
    Settings → Connected apps

Now: 14 database changes, 112 automated tests, 52 database security checks, and a 38-step
connector test run against the practice database.

---

## 15. Claude connector (use ProjectHub from Claude)

**What it is.** A "remote MCP server" at `https://<site>/mcp`. Someone adds it in Claude
(**Settings → Connectors → Add custom connector**, address `https://project-hub-five-psi.vercel.app/mcp`),
signs in to ProjectHub and presses **Allow**. Claude can then use these tools as that person:

| Reads | Writes (nothing is ever deleted) |
|---|---|
| `about_me`, `list_projects`, `list_todos` (overdue / today / this week / for me…), `list_meetings`, `list_notes`, `read_note`, `search` | `add_todo`, `update_todo` (tick off, reopen, move, assign), `add_meeting`, `add_note` (in your own section), `add_to_note` (your own notes only) |

Dates like "tomorrow", "Friday" and "2pm" are understood in the person's time zone. Each person
connects their own Claude account; it uses their own Claude plan, and costs ProjectHub nothing.

**How sign-in works.**
1. Claude calls `/mcp` without a token → `401` with `WWW-Authenticate: Bearer resource_metadata=…`.
2. Claude reads `/.well-known/oauth-protected-resource/mcp`: "sign in with
   `https://<ref>.supabase.co/auth/v1`" (Supabase's OAuth 2.1 server).
3. Claude registers itself with Supabase (dynamic client registration) and sends the person to
   Supabase, which sends them to **`/oauth/consent`** in ProjectHub. They log in (password and 2FA)
   if needed, see what Claude will be able to do, and press **Allow** (`actions/oauth.ts`).
4. Supabase gives Claude an access token (a normal ProjectHub login for that person) and a
   refresh token. Claude sends the access token with every request.
5. `/mcp` checks the token (`lib/mcp/auth.ts`), loads the person, and runs the tool through a
   Supabase client carrying their token, so all the database rules apply.

**Supabase settings (do this for dev and prod).** Authentication → **OAuth Server**:
enable it, set **Authorization Path** to `/oauth/consent`, and turn on **dynamic client
registration** ("Allow Dynamic OAuth Apps"). The Site URL (Authentication → URL Configuration) must
be the app's address, because the path is added to it. No database change and no new settings in
Vercel (it uses `SITE_URL` and the two public Supabase values).

**Code.** `src/app/mcp/route.ts` (HTTP), `src/lib/mcp/protocol.ts` (JSON-RPC, no extra package),
`tools.ts` (the tools), `auth.ts` (token check), `metadata.ts` + `src/app/.well-known/*`
(discovery), `words.ts` (dates, times, names, text → note), `(auth)/oauth/consent/page.tsx`,
`components/settings/connected-apps.tsx`. The CSP `form-action` allows redirects back to
`claude.ai`, `claude.com` and localhost (Claude Code).

**Testing.** Unit tests in `tests/unit/mcp.test.ts`. On the live site: connect from Claude, then
ask "What projects do I have in ProjectHub?" and "Add a to-do to <project> for tomorrow".
Settings → Connected apps shows Claude, with Disconnect.

**Troubleshooting.**
- "Couldn't reach the MCP server" in Claude: check `https://<site>/.well-known/oauth-protected-resource/mcp`
  opens and shows JSON; check the OAuth Server is enabled in Supabase.
- Sign-in page says "This request has expired": requests last ~10 minutes; connect again.
- Connector says "two-step sign-in": see section 12 (known limits).
