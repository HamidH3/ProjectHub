# ProjectHub: everything you need to know

> **For Claude (or any developer) reading this:** this is the complete guide to
> ProjectHub, a private project-management and personal-CRM web app. Read it
> fully before suggesting changes. Follow the "Rules for changing the code" and
> "Security model" sections: they record decisions that were made on purpose.
> Never ask for, print or commit passwords, the Supabase secret key or other
> secrets.

Owner: **Hamid Hafiz** (GitHub `HamidH3`, admin username in the app `hamidh3`).
Last updated: 12 November 2026 (invite link fix).

---

## 1. What it is

A private, invite-only web app for keeping every project in one place:

- **Projects** with a colour, status, dates, archive/restore.
- **Home page**: greeting, "Start new project", project cards, and **paper sticky notes** with
  today's to-dos and meetings for each project (tick them off right there), plus an "Overdue" note.
- **Notes** (OneNote-style): rich text editor, nested subpages, drag-and-drop to reorder,
  hold on a note to put another inside it, drag left/right to change level, autosave.
- **To-dos**: grouped Overdue / Today / Tomorrow / each weekday / Later / No day; quick add;
  priority and time; tick off with Undo; Completed view.
- **Calendar**: month view per project and across all projects; **meetings** (day, from/to
  time or all-day, place/link, notes).
- **Files**: private uploads (PDF, Word, Excel, CSV, PowerPoint, text, PNG, JPG, ZIP; max 50 MB),
  folders inside folders, drag to move, rename, preview images, open/download.
- **People** (admins): invite by email, choose each person's projects, make admin/member,
  password reset links, remove people. Each project's **Members** tab shows who can open it.
- **Search everything** (Ctrl+K or "/"): projects, notes (with highlighted snippets), to-dos,
  meetings and files.
- **Security**: invite-only, 2FA (authenticator app) required for admins, database-level access
  rules on every table, private file storage.

Dark theme: background `#111111`, sidebar `#191919`, panels `#202020`, orange accent `#d97757`.

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
| Supabase **prod** | **projecthub-prod**, London | Used by the live site; real data |
| **Email** (optional, not set up yet) | Resend (resend.com) | Needs a verified domain to email other people |
| Secrets | Password manager | `.env.local` copy, DB passwords, setup tokens |
| Claude project notes | `claude/projecthub-build-decisions.md` in the PersonalCRM Claude project | Detailed build log |

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
| Email | Resend REST API (called with `fetch`, no package) | |
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
│  ├─ migrations/               ← the 11 database changes, applied in order
│  └─ tests/security-check.sql  ← paste into Supabase SQL Editor to test the rules
└─ src/
   ├─ proxy.ts                  ← runs before every page: refreshes the login, sends logged-out people to /login
   ├─ app/
   │  ├─ (auth)/                ← login, setup, mfa, forgot-password, update-password, welcome,
   │  │                           invite/[code] (invite links), continue (reset links)
   │  ├─ auth/confirm/          ← old-style email links: forwards them to /continue
   │  ├─ auth/signout/          ← signs out removed accounts
   │  └─ (app)/                 ← logged-in area
   │     ├─ page.tsx            ← home (cards + sticky notes)
   │     ├─ calendar/, people/, settings/
   │     └─ projects/[projectId]/  ← overview, notes, tasks, calendar, files (+ [fileId] open/download route), members
   ├─ actions/                  ← server actions: auth.ts, projects.ts, members.ts
   ├─ components/               ← auth, calendar, files, home, layout, notes, people, projects, search, tasks, ui
   ├─ lib/
   │  ├─ supabase/              ← client.ts (browser), server.ts (pages), admin.ts (SECRET key, server only), proxy.ts
   │  ├─ auth.ts                ← getCurrentUser(): login, 2FA and password-change checks for every page
   │  ├─ validation/            ← Zod rules (auth, project, members)
   │  ├─ days.ts, schedule.ts, file-types.ts, search.ts, note-tree.ts   ← pure helpers (unit-tested)
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
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional email (e.g. `ProjectHub <projecthub@yourdomain.com>`) | Key: **yes** |

Make a new random token in PowerShell:
```powershell
$b = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

---

## 6. Commands (PowerShell, in `C:\Users\hamid\dev\projecthub`)

| Task | Command |
|---|---|
| Run locally (uses **dev** database) | `npm run dev` → http://localhost:3000 |
| All automated checks | `npm run check` (types + lint + 59 tests) |
| Tests only / re-run on save | `npm test` / `npm run test:watch` |
| Apply database changes to the **linked** project | `npx supabase db push --remote` (**always `--remote`**) |
| See which migrations are applied | `npx supabase migration list --remote` |
| Refresh the TypeScript database types | `npx supabase gen types typescript --remote \| Out-File -Encoding utf8 src\types\database.ts` |
| Point the CLI at **prod** | `npx supabase link --project-ref <prod-ref>` |
| Point it back at **dev** (always do this after) | `npx supabase link --project-ref tswrxiqnsxxfppitohkx` |
| Copy a file to paste into the SQL Editor | `Get-Content supabase\tests\security-check.sql -Raw \| Set-Clipboard` |
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
- **Email links** are built from `SITE_URL`, never from the request's address (a faked "Host"
  header could otherwise point a real link at another site).
- **Redirects after login** (`?next=`) go through `safeNextPath()`: same-site paths only;
  control characters and backslashes are refused.
- **Security headers** (`next.config.ts`): no framing, nosniff, strict referrer, permissions
  policy, a basic CSP, HSTS in production.
- **Removed accounts** are signed out on their next click (`/auth/signout?reason=removed`).
- **Proof**: `supabase/tests/security-check.sql` tests about 40 of these rules on the real
  database and rolls everything back.

---

## 9. Database

11 migrations in `supabase/migrations/`, applied in order:

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
- New tables: add RLS, the 2FA restrictive rule, revoke `anon`, grant `authenticated`, and add
  checks to `security-check.sql`.
- After adding a migration, regenerate `src/types/database.ts`.
- ESLint includes React Compiler rules: `useCallback` dependencies must be whole values.

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

**Ideas offered, not built yet**: drag to-dos between days; repeating to-dos and meetings;
assign to-dos to people; Outlook calendar (private subscribe link, "Add to Outlook" .ics, or
full Microsoft 365 sync, which needs company IT approval); Resend email set-up; custom domain;
an explicit-permissions migration so "Automatically expose new tables" could be turned off.

---

## 13. Running it elsewhere (Docker / Kubernetes): e.g. for a buyer

The app itself holds nothing on its own disk: all data is in Supabase. So moving it means:
**a Supabase project** (theirs) + **the app container** (anywhere) + **HTTPS** in front.

### 13.1 Their own Supabase

1. Create a Supabase project (supabase.com, any region; keep **Data API** and **Automatically
   expose new tables** ON; automatic RLS optional).
2. Apply all 11 migrations: `npx supabase link --project-ref <their-ref>` then
   `npx supabase db push --remote`.
3. Authentication settings: sign-ups **off**, Site URL = their address, Redirect URLs =
   `https://their-address/**`, Email OTP expiry 86400.
4. Run `supabase/tests/security-check.sql` in their SQL Editor → ALL CHECKS PASSED.

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

Several copies can run at once (rate limits and logins live in Postgres).

### 13.4 Handing it over / selling

- Give them the **code** (a new GitHub repo or a zip), **not** your `.env.local`, keys, or database.
- They create **their own** Supabase project, Vercel/server and (optionally) Resend account,
  following 13.1 to 13.3. They start with an empty database and make their first admin through
  `/setup` with their own `SETUP_TOKEN`.
- If they'll use Vercel for a business, that's the Pro plan; Supabase Pro removes the weekly pause
  and adds backups.
- The libraries used are under permissive open-source licences (Next.js, React, Supabase
  libraries, TipTap core, shadcn/ui, dnd-kit, Zod: MIT; lucide: ISC; Geist font: SIL OFL;
  lightningcss (build tool only): MPL-2.0), which allow commercial use. Keep their licence
  notices.
- Before selling, check your employment contract to confirm you own what you built (some
  contracts claim work made while employed), and use a written agreement/licence for the sale.
  This is general information, not legal advice.

---

## 14. Build history (short)

All built 6–12 November 2026 with Claude, step by step:
architecture and accounts → Supabase schema and security → login, setup, 2FA → projects and home →
notes (tree, drag and drop, autosave) → to-dos, calendar, meetings, sticky notes → files and folders
(readable storage names) → people and invites → search → testing (59 tests, database security
check, GitHub checks; found and fixed a redirect hole) → deployment (Supabase prod in London,
Vercel) → Docker and Kubernetes.
