# ProjectHub

A private, invite-only workspace for a person or a small team, keeping every project in one place:

- **Projects** with notes (rich text, subpages, drawing, pictures), to-dos you can assign,
  a calendar of meetings, and files and folders
- **People**: invite by email, choose who sees which project, admins and members, two-step sign-in
  (2FA), and per-person switches (who can create projects, who can use the meeting recorder)
- **Meeting recorder** (optional): a bot joins Teams/Zoom/Google Meet calls and Claude writes the
  notes into the right project
- **Claude connector** (optional): use ProjectHub from a Claude chat ("what's due today?")
- **Search everything**, colour themes, works on phones

Built with Next.js, Supabase (database, sign-in, file storage) and Tailwind CSS. Runs on Vercel,
or on your own server with Docker or Kubernetes.

---

## Contents

1. [Before you start](#before-you-start)
2. [Free or paid: choose your plans](#free-or-paid-choose-your-plans)
3. [Setup, step by step](#setup-step-by-step) (about 30–45 minutes)
4. [Everyday commands](#everyday-commands)
5. [Making changes and updating](#making-changes-and-updating)
6. [Keeping it safe](#keeping-it-safe)
7. [All the guides](#all-the-guides)

---

## Before you start

**On your computer** (Windows, macOS or Linux):

| Tool | Get it | Check it's installed |
|---|---|---|
| **Node.js 22 (LTS)** | [nodejs.org](https://nodejs.org) → the LTS download | `node -v` shows `v22…` or newer |
| **Git** | [git-scm.com](https://git-scm.com/downloads) | `git --version` |
| A code editor (optional) | e.g. [VS Code](https://code.visualstudio.com) | |

**Accounts** (all have free options; see the next section):

| Account | Needed for | Required? |
|---|---|---|
| [Supabase](https://supabase.com) | The database, sign-in and file storage | **Yes** |
| [GitHub](https://github.com) | Storing your copy of the code (and deploying to Vercel) | Recommended |
| [Vercel](https://vercel.com) **or** your own server | Putting the site online | One of them |
| Gmail or [Resend](https://resend.com) | Sending invite and password emails | Optional |
| [Recall.ai](https://www.recall.ai) + [Claude Console](https://console.anthropic.com) | The meeting recorder | Optional |

**Where to type commands:** open a terminal **in the project folder**.
- Windows: open the folder in File Explorer, click the address bar, type `powershell`, press Enter.
- macOS: right-click the folder in Finder → *New Terminal at Folder*.
- In VS Code: *Terminal → New Terminal*.

Type each command on its own line and press Enter. Wait for it to finish before the next one.

> Put the project in a normal folder such as `Documents\projecthub` or `C:\dev\projecthub`, **not**
> one synced by OneDrive, iCloud or Dropbox (syncing breaks the installed packages).

---

## Free or paid: choose your plans

You can start completely free and upgrade later; nothing in the code changes. The choice is yours:

| Service | Free option | Paid option | Why you might pay |
|---|---|---|---|
| **Supabase** | Free: 2 projects; pauses after a week with no use | Pro (monthly, per organisation) | No pausing, daily backups, more space |
| **Hosting** | Vercel Hobby (personal, **non-commercial** use only) | Vercel Pro, or your own server/cloud with Docker | Business use, more capacity, your own infrastructure |
| **Email** | Gmail with an app password, or Resend's free tier | Resend paid tiers | Sending from your own domain, more emails |
| **Meeting recorder** | Recall.ai gives a few free hours to try | Pay as you go (per meeting hour) + Claude API (per use) | Only if you use the recorder |

Details, current prices and typical monthly totals: **[docs/PLANS-AND-COSTS.md](docs/PLANS-AND-COSTS.md)**.

---

## Setup, step by step

Do these in order. Each step says how to check it worked.

### Step 1. Install the project

Unzip or clone the project into its folder, open a terminal there, and run:

```bash
npm ci
```

✔ It ends without red `ERR!` lines. (Warnings are fine.) If you see `ERESOLVE`, never add `--force`;
see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

### Step 2. Create your Supabase project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
   - Name: e.g. `projecthub`. Region: the one closest to you and your users.
   - **Database password**: click *Generate*, and **save it in a password manager** (you'll need it
     in Step 4).
   - Keep **Enable Data API** on. Keep **Automatically expose new tables** on.
2. Wait about a minute for it to start, then change these settings:

| Where in Supabase | Setting | Set to |
|---|---|---|
| **Authentication → Sign In / Providers** | Allow new users to sign up | **Off** (people only join by invite) |
| **Authentication → Sign In / Providers → Email** | Email OTP Expiration | `86400` (one day) |
| **Authentication → URL Configuration** | Site URL | `http://localhost:3000` for now (changed in Step 8) |
| **Authentication → URL Configuration** | Redirect URLs → Add | `http://localhost:3000/**` |

3. Write down the **project ref**: the 20 letters in the dashboard's address
   (`supabase.com/dashboard/project/`**`abcdefghijklmnopqrst`**).

> **Tip: a practice copy.** The free plan allows two projects. Many owners make a second one
> (e.g. `projecthub-dev`) to try changes on before the real one. Set it up the same way.

### Step 3. Create your settings file

```bash
npm run setup
```

It asks for a few values (copy them from Supabase; secret ones are hidden as you paste):

| It asks for | Where to find it in Supabase |
|---|---|
| Project URL | **Project Settings → Data API** → Project URL (`https://<ref>.supabase.co`) |
| Publishable key | **Project Settings → API Keys** → `sb_publishable_…` |
| Secret key | **Project Settings → API Keys → Secret keys** → `sb_secret_…` (click to reveal) |
| The address people will open | Press Enter for `http://localhost:3000` (you'll set the real one later) |

It also creates a one-time **`SETUP_TOKEN`** for making your first admin, and offers to set up email
and the meeting recorder (you can say No and do them later).

✔ It says *Saved .env.local*. This file holds your keys: **never share it or upload it**. Git ignores
it automatically.

### Step 4. Build the database

```bash
npx supabase login
```
(Opens the browser to sign in to Supabase. Say yes to installing the `supabase` package if asked.)

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```
(Asks for the **database password** from Step 2.)

```bash
npx supabase db push --remote
```
(Shows the list of database changes and asks to apply them: type `Y`.)

```bash
npm run db:types
```

✔ The last one says *src/types/database.ts updated*.

### Step 5. Check everything

```bash
npm run doctor
```

✔ Every line under *Supabase* has a green ✓. Anything red tells you exactly what to fix.

Then prove the security rules work on your database. Copy the check to the clipboard:

- Windows: `Get-Content supabase\tests\security-check.sql -Raw -Encoding UTF8 | Set-Clipboard`
- macOS: `pbcopy < supabase/tests/security-check.sql`

In Supabase open **SQL Editor → + → Create a new snippet**, paste (Ctrl+V / ⌘V) and click **Run**.

✔ The result says **ALL CHECKS PASSED**. (It runs on throwaway test data and removes it again.)

### Step 6. Start it and create your admin account

```bash
npm run dev
```

1. Open **http://localhost:3000/setup**.
2. Paste the **SETUP_TOKEN** (open `.env.local` in a text editor and copy the value after `SETUP_TOKEN=`).
3. Enter your name, email, a username and a strong password.
4. You'll be asked to set up **two-step sign-in** with an authenticator app (Google Authenticator,
   Microsoft Authenticator, 1Password…). Admins always need it.

✔ You see the home page. Make a project, a note and a to-do to try it.

Press **Ctrl+C** in the terminal to stop it. Then remove the token, as it's no longer needed: delete
the `SETUP_TOKEN=` line from `.env.local`. (`npm run doctor` reminds you.)

### Step 7. Put it online

Pick **one**:

| Option | Best for | Guide |
|---|---|---|
| **A. Vercel** | The simplest: it builds and hosts the site from GitHub, with HTTPS done for you | [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) |
| **B. Docker** | Your own server or VM (one machine) | [docs/DEPLOY-DOCKER.md](docs/DEPLOY-DOCKER.md) |
| **C. Kubernetes** | Companies that already run a cluster | [docs/DEPLOY-KUBERNETES.md](docs/DEPLOY-KUBERNETES.md) |

Each guide ends with the same three things:
1. In Supabase → **Authentication → URL Configuration**: set **Site URL** to your live address
   (e.g. `https://projecthub.yourcompany.com`) and add `https://projecthub.yourcompany.com/**` to
   **Redirect URLs**.
2. If the live site uses a **different** Supabase project from the one you set up in Step 6 (for
   example, you used a practice copy), open `https://<your-site>/setup` once to create the admin
   there, with that deployment's `SETUP_TOKEN`.
3. Remove `SETUP_TOKEN` from the hosting settings once the admin exists.

### Step 8. Invite your people

Sign in → **People → Invite someone**. Choose admin or member and which projects they can open.
Without email set up, ProjectHub shows the invite link for you to send yourself.

Per person you can also switch on **Create projects** and **Meeting recorder**.

### Step 9 (optional). Extra features

All in **[docs/OPTIONAL-FEATURES.md](docs/OPTIONAL-FEATURES.md)**:

- **Email** for invites and password resets (Gmail or Resend)
- **Meeting recorder** (Recall.ai + Claude API)
- **Claude connector** (use ProjectHub from Claude)

After adding settings, run `npm run doctor` again (and add them to your hosting too).

---

## Everyday commands

| What | Command |
|---|---|
| Run it on your computer | `npm run dev` → http://localhost:3000 |
| Check the code (types, style, 128 tests) | `npm run check` |
| Create or change the settings file | `npm run setup` |
| Check settings, Supabase and the database | `npm run doctor` |
| Apply new database changes | `npx supabase db push --remote` then `npm run db:types` |
| Make a random token | `npm run secret` |

---

## Making changes and updating

1. Change and try it locally (`npm run dev`), then `npm run check`.
2. If there's a new file in `supabase/migrations/`: `npx supabase db push --remote`, `npm run db:types`,
   and run the security check (Step 5) again. Using a practice copy? Do it there first, then
   `npx supabase link --project-ref <live-ref>`, push, and link back.
3. Publish: with Vercel, `git add .`, `git commit -m "what changed"`, `git push` (it redeploys by
   itself). With Docker/Kubernetes, rebuild and restart as in their guides.

How it all works (security model, database, code rules): **[PROJECTHUB.md](PROJECTHUB.md)**.
Manual test checklist: **[TESTING.md](TESTING.md)**.

---

## Keeping it safe

- **Never commit or share** `.env.local`, `.env.docker` or `deploy/kubernetes/secret.env`. They hold
  your keys. Git already ignores them.
- The **secret key** (`SUPABASE_SECRET_KEY`) bypasses every rule: keep it in hosting settings marked
  *Sensitive*/*Secret*, never in code or chat.
- Keep **sign-ups off** in Supabase (Step 2). `npm run doctor` warns you if they're on.
- Admins must use **two-step sign-in**. Members can turn it on in Settings.
- Data protection: you're responsible for the data people put in. Check your organisation's rules
  before storing client or company information, and tell people when a meeting is recorded.

---

## All the guides

| Guide | What's in it |
|---|---|
| [docs/PLANS-AND-COSTS.md](docs/PLANS-AND-COSTS.md) | Free vs paid for each service, typical monthly totals |
| [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) | Putting it online with Vercel |
| [docs/DEPLOY-DOCKER.md](docs/DEPLOY-DOCKER.md) | Running it with Docker (with HTTPS) |
| [docs/DEPLOY-KUBERNETES.md](docs/DEPLOY-KUBERNETES.md) | Running it on Kubernetes |
| [docs/OPTIONAL-FEATURES.md](docs/OPTIONAL-FEATURES.md) | Email, meeting recorder, Claude connector |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and fixes |
| [PROJECTHUB.md](PROJECTHUB.md) | How everything works, for developers |
| [TESTING.md](TESTING.md) | Automated tests and a click-through checklist |
