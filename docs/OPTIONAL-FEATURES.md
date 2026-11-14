# Optional features

Each one is switched on just by adding settings: to `.env.local` (on your computer, or run
`npm run setup` again) **and** to wherever the live site runs (Vercel environment variables,
`.env.docker`, or `deploy/kubernetes/secret.env`). Then restart or redeploy, and check with
`npm run doctor`.

- [Email](#email-invites-and-password-resets)
- [Meeting recorder](#meeting-recorder)
- [Claude connector](#claude-connector)
- [Who can do what](#who-can-do-what)

---

## Email (invites and password resets)

Without email, ProjectHub still works: it shows invite and reset links for you to copy and send.
The People page shows a green banner when email is set up, and a yellow one when it isn't.
Emails don't name the admin who sent them: the sender is "ProjectHub".

### Option 1: Gmail (free)

Best with a Gmail account made just for ProjectHub, since its address is the sender people see.

1. Google Account → **Security** → turn on **2-Step Verification**.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), name it
   `ProjectHub`, and copy the 16-letter password. (This is not your normal Gmail password.)
3. Settings:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your.address@gmail.com
SMTP_PASSWORD=the16letterpassword
```

Gmail allows a few hundred emails a day, plenty for invites. To stop it, delete the app password
in Google.

### Option 2: Resend (free tier, or paid for more)

Lets emails come from your own domain (e.g. `hello@yourcompany.com`).

1. Sign up at [resend.com](https://resend.com), add and verify your domain (it gives you DNS records
   to add), and create an API key.
2. Settings (only used when the SMTP settings are empty):

```
RESEND_API_KEY=re_...
EMAIL_FROM=ProjectHub <hello@yourcompany.com>
```

---

## Meeting recorder

An admin (or a member with the *Meeting recorder* switch on) opens **Meeting recorder**, pastes a
Teams, Zoom or Google Meet link, and a bot called "ProjectHub Notetaker" joins, posts a message saying
it's recording, and records. Afterwards Claude writes the notes (summary, decisions, action items,
the full transcript) into the project you pick, under **AI notes** in its Notes tab. Anyone on that
project can then edit them. The recording is deleted from Recall.ai once ProjectHub has the transcript.

It uses two pay-as-you-go services (see [PLANS-AND-COSTS.md](PLANS-AND-COSTS.md)):

### 1. Recall.ai (the bot)

1. Sign up at [recall.ai](https://www.recall.ai) and pick the region for your data (e.g. EU,
   `eu-central-1`). Add a payment method.
2. **Developers → API Keys & Secrets**: create an **API key**, then **Create Workspace Secret** (starts
   with `whsec_`).
3. **Webhooks → Add Endpoint**: `https://your-site/api/recall/webhook`, and tick all `bot.*` and
   `transcript.*` events. (This needs the live site on HTTPS. On your own computer it still works
   while the Meeting recorder page is open, as the page checks by itself.)

### 2. Claude API (the summaries)

1. [console.anthropic.com](https://console.anthropic.com): **Billing** → add credit; **Limits** → set a
   monthly spending limit; **API Keys** → create a key (choose "Somewhere else / use an API key").
2. This is separate from a Claude Pro or Max chat subscription.

### 3. Settings

```
RECALL_API_KEY=...
RECALL_REGION=eu-central-1          # the region you signed up in
RECALL_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
# Optional: a cheaper model, e.g. claude-haiku-5-5 (default claude-sonnet-5-5)
ANTHROPIC_MODEL=
# Optional: keep recordings at Recall.ai instead of deleting them (default: deleted)
RECALL_KEEP_MEDIA=
```

### Good to know

- The meeting must allow guests; the bot waits in the lobby until someone lets it in. It leaves by
  itself after 10 minutes in the lobby or alone.
- Speaker names come from the meeting app, so people sharing one device appear under one name.
- **Tell people they're being recorded** and follow your organisation's rules on recording and on
  sending meeting content to outside services.
- Who can send the bot: admins, and members you switch on in **People**.

---

## Claude connector

Lets each person use ProjectHub from their own Claude account: "what's due today?", "add a to-do for
Sam", "summarise this transcript into the AI notes". Claude signs in as that person and only sees
what they can see. It costs ProjectHub nothing; each person uses their own Claude plan.

1. Supabase → **Authentication → OAuth Server**: **Enable**, set **Authorization Path** to
   `/oauth/consent`, and turn on **Allow Dynamic OAuth Apps** (dynamic client registration).
2. Make sure Supabase's **Site URL** is your live address (README Step 7).
3. Each person, in Claude: **Settings → Connectors → Add custom connector**, address
   `https://your-site/mcp`, then sign in to ProjectHub and press **Allow**.

People can see and disconnect connected apps in ProjectHub under **Settings → Connected apps**.

---

## Who can do what

| | Admin | Member |
|---|---|---|
| See projects | All | Only the ones they're added to |
| Notes, to-dos, calendar, files in their projects | ✓ | ✓ (others' personal notes are read-only) |
| Create projects | ✓ | If switched on in **People** |
| Use the meeting recorder | ✓ | If switched on in **People** |
| Edit / archive a project | ✓ | Only projects they created, while they're on them |
| Delete projects, manage people, invite | ✓ | ✗ |
| Two-step sign-in | Required | Optional (Settings) |

Switching *Create projects* off stops new projects only: people stay on the projects they made until
an admin takes them off (People → ⋯ → Choose projects, or the project's Members tab).
