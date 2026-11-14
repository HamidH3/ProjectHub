# Troubleshooting

**First, run `npm run doctor`** (or `npm run doctor -- --file .env.docker`). It checks the settings,
Supabase, the database and the optional services, and says what to fix.

## Installing and commands

| Problem | Fix |
|---|---|
| Windows: *running scripts is disabled on this system* when using `npm` or `npx` | Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and answer `Y` |
| `npm ci` says `ERESOLVE` | Don't use `--force` or `--legacy-peer-deps`. Delete the `node_modules` folder and run `npm ci` again; make sure `node -v` is 22 or newer |
| Errors about files being locked, or very slow installs | The folder is inside OneDrive/iCloud/Dropbox. Move the project to a normal folder |
| `npx supabase link` asks for a password | It's the **database password** you saved when creating the Supabase project (Supabase → Project Settings → Database → *Reset password* if lost) |
| `npm run check` fails with type errors after a `db push` | Run `npm run db:types` |
| `npm run setup` stops with "no more answers" | It was given fewer answers than it asks for. Run it in a normal terminal window |

## Signing in

| Problem | Fix |
|---|---|
| The site works but nothing loads, or "Invalid API key" | Check the two `NEXT_PUBLIC_SUPABASE_…` values. With Docker/Kubernetes they're built into the image: rebuild after changing them |
| Everything stopped working after a quiet week | The Supabase Free project was **paused**: Supabase dashboard → the project → **Restore** |
| `/setup` says the token is wrong | Copy `SETUP_TOKEN` again (whole value, no spaces). It must be in the settings of the server you're using, which needs a restart/redeploy after adding it |
| `/setup` says setup is already done | An admin already exists: sign in instead, and remove `SETUP_TOKEN` |
| Invite or reset links go to `localhost` or the wrong address | Set `SITE_URL` to the live address (no slash at the end), redeploy, and set Supabase → Authentication → URL Configuration (Site URL and Redirect URLs) |
| Invite link says it has expired | Links last 7 days and until used. On **People**, use ⋯ → **New sign-up link** (or Resend) |
| Lost the authenticator app | Codes can't be recovered. The owner can remove the person's two-step factor in Supabase (Authentication → Users → select the person), or remove and re-invite them; they then set it up again |

## Email

| Problem | Fix |
|---|---|
| People page shows the yellow "Email isn't set up" banner | All four `SMTP_` settings (or `RESEND_API_KEY` + `EMAIL_FROM`) must be in the live site's settings; redeploy |
| Gmail refuses to send | Use an **app password** (needs 2-Step Verification on the Google account), not the normal password |
| Emails land in spam | Normal for brand-new senders. Ask people to mark it "not spam"; or use Resend with your own verified domain |

## Hosting

| Problem | Fix |
|---|---|
| Vercel build fails with missing settings | Add the environment variables (ticked for **Production**) and redeploy |
| Docker build says *Set --build-arg NEXT_PUBLIC_SUPABASE_URL…* | Use `docker compose --env-file .env.docker up -d --build`, or pass both `--build-arg`s |
| Container is *unhealthy* | `docker compose logs projecthub`: usually a missing setting. Check with `npm run doctor -- --file .env.docker` |
| Signed in, then sent back to the sign-in page | The site must be served over **HTTPS** (except on localhost), and `SITE_URL` must match the address in the browser |
| Kubernetes pods not ready | `kubectl -n projecthub describe pod <name>` and `kubectl -n projecthub logs <name>` |

## Meeting recorder

| Problem | Fix |
|---|---|
| Yellow "isn't set up yet" box on the recorder page | All four settings are needed: `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` |
| "Recall.ai couldn't send the bot" | Check the link is a Teams/Zoom/Meet meeting link; check the Recall key and that `RECALL_REGION` is the region you signed up in |
| The bot stays in the lobby, or "Nobody let the bot in" | Someone has to admit it; the meeting must allow guests |
| Stuck on "Meeting over, getting the transcript" | The webhook can't reach the site: check the endpoint address in Recall.ai is `https://your-site/api/recall/webhook` and the workspace secret matches. Keeping the recorder page open also moves it on |
| "The Claude Console account is out of credit" / key refused | Add credit or create a new key at console.anthropic.com, then press **Try again** on the meeting |
