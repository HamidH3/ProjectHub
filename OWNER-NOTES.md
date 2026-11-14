# Owner notes (private)

> **Only for the owner.** This file has your accounts, addresses and project refs. It is **left
> out automatically** by `npm run clean-copy`, so a buyer never gets it. Everything else in the
> repository is written for anyone. Never put passwords or keys here either: those belong in your
> password manager.

Owner: **Hamid Hafiz** (GitHub `HamidH3`, admin username in the app `hamidh3`).

## Where my copy lives

| What | Where | Notes |
|---|---|---|
| **Live app** | https://project-hub-five-psi.vercel.app | Production |
| **Code** | GitHub `HamidH3/ProjectHub` (private) | `main` branch deploys automatically |
| **Code on my laptop** | `C:\Users\hamid\dev\projecthub` | NOT in OneDrive (sync breaks `node_modules`) |
| **Hosting** | Vercel: team "hh's projects", project **project-hub**, Hobby (free) plan | Server code runs in London (`lhr1`) via `vercel.json` |
| **Database, logins, file storage** | Supabase organisation **HamidH3**, Free plan | Two projects, below |
| Supabase **dev** | **projecthub-dev**, ref `tswrxiqnsxxfppitohkx` | Used by `npm run dev` on the laptop; test data |
| Supabase **prod** | **projecthub-prod**, London, ref `jbobiprzbnqmblytqmid` | Used by the live site; real data |
| **Email** | Gmail SMTP with an app password | PROJECTHUB.md section 5, "Email" |
| **Meeting recorder** | Recall.ai (EU, `eu-central-1`) and the Claude Console (API key "ProjectHub") | Webhook: `https://project-hub-five-psi.vercel.app/api/recall/webhook` |
| Secrets | Password manager | `.env.local` copy, DB passwords, API keys |
| Claude project notes | `claude/projecthub-build-decisions.md` and `claude/PROJECTHUB.md` in the PersonalCRM Claude project | Detailed build log |

## My commands (PowerShell, in `C:\Users\hamid\dev\projecthub`)

| Task | Command |
|---|---|
| Point the CLI at **prod** | `npx supabase link --project-ref jbobiprzbnqmblytqmid` (asks for prod's database password) |
| Point it back at **dev** (always do this after) | `npx supabase link --project-ref tswrxiqnsxxfppitohkx` |
| Unzip files Claude sends | `Expand-Archive -Path $HOME\Downloads\<file>.zip -DestinationPath . -Force` |

Everything else is in PROJECTHUB.md section 6 and the README.

## Handing it over or selling it

1. **Your words list (once).** `npm run clean-copy` creates `.clean-copy-words.txt` the first
   time. Put in, one per line: your name, usernames, every email address you use, your company
   name, the live site's address, both Supabase refs, `C:\Users\hamid`. Git ignores this file and
   the clean copy never includes it.
2. **Make the copy.**
   ```powershell
   npm run clean-copy
   ```
   It copies only the project's own files (no `.env` files, no `node_modules`, **no Git history**,
   which contains your name and email in every commit) into `..\projecthub-clean-<date>`, then
   scans it. If it finds any of your words or anything that looks like a key, it lists where and
   stops: fix those in the project, delete the copy, run it again.
3. **Zip it** (the command is printed at the end) and send the zip, or put it in a **new** GitHub
   repository created for the buyer. Don't transfer your own repository: its history has your
   details.
4. **Never send** your `.env.local`, `.env.docker`, `deploy/kubernetes/secret.env`, database
   exports, or access to your Supabase/Vercel/Recall/Anthropic accounts. The buyer creates their own
   (README, steps 1–9) and starts with an empty database.
5. **Before selling:** check your employment contract to confirm you own what you built (some
   contracts claim work made while employed), and use a written agreement or licence for the sale.
   This is general information, not legal advice.
6. **Licences:** the libraries used are under permissive open-source licences that allow commercial
   use (Next.js, React, Supabase libraries, TipTap core, shadcn/ui, dnd-kit, Zod: MIT; Nodemailer:
   MIT-0; lucide: ISC; Geist font: SIL OFL; lightningcss (build tool only): MPL-2.0). Their licence
   notices stay in `node_modules` and must be kept.
7. **Buyer document:** the overview made for buyers (ProjectHub-overview.docx/.pdf) is kept
   outside the repository.
