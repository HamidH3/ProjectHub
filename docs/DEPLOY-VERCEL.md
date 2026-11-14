# Putting ProjectHub online with Vercel

The simplest option: Vercel builds the site from your GitHub repository, gives it an HTTPS address,
and updates it every time you push a change. Do README Steps 1–6 first.

> **Free or paid?** Vercel's free *Hobby* plan is for personal, non-commercial use. For a business,
> use *Pro*, or host it yourself ([DEPLOY-DOCKER.md](DEPLOY-DOCKER.md)). See [PLANS-AND-COSTS.md](PLANS-AND-COSTS.md).

## 1. Put your copy of the code on GitHub

1. On [github.com](https://github.com) → **New repository**. Name it e.g. `projecthub`, choose
   **Private**, and don't add a README or licence (the project already has them).
2. In your project folder, run these one at a time (use the address GitHub shows you):

```bash
git init
git add .
git commit -m "First version"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/projecthub.git
git push -u origin main
```

✔ Refresh the GitHub page: your files are there, and **no `.env.local`** (Git ignores it).

GitHub also runs the automatic checks on every push (the tick or cross next to each commit).

## 2. Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → pick your
   repository → **Import**.
2. Framework: **Next.js** (detected). Leave the build settings as they are.
3. Open **Environment Variables** and add these (values from your `.env.local`, or new ones for a
   separate live Supabase project). Tick **Production** only; mark the secret ones **Sensitive**:

| Name | Value | Sensitive? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | No |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | **Yes** |
| `SITE_URL` | Leave it for now (step 4) | No |
| `SETUP_TOKEN` | Only if this Supabase project has no admin yet: `npm run secret` makes one | **Yes** |
| Email / meeting recorder settings | If you set them up ([OPTIONAL-FEATURES.md](OPTIONAL-FEATURES.md)) | Keys: **Yes** |

4. Click **Deploy** and wait a couple of minutes.

## 3. Choose the server region (optional)

`vercel.json` says where the server code runs: `"regions": ["lhr1"]` (London). For speed, pick the
region **closest to your Supabase project**, e.g. `fra1` (Frankfurt), `iad1` (Washington DC),
`sfo1`, `syd1`, `hnd1` (Tokyo). Change it, then `git add . && git commit -m "Region" && git push`.

## 4. Set the address

1. Copy your site's address from Vercel (e.g. `https://projecthub-abc.vercel.app`), or add your own
   domain under **Settings → Domains**.
2. Vercel → **Settings → Environment Variables** → add `SITE_URL` = that address (**no slash at the
   end**).
3. **Deployments** → the latest → **⋯ → Redeploy**.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: your address
   - **Redirect URLs** → **Add URL**: `https://your-address/**`

## 5. First admin and tidying up

- If this Supabase project has no admin yet: open `https://your-address/setup`, paste the
  `SETUP_TOKEN`, and create the admin (with two-step sign-in).
- Then **delete `SETUP_TOKEN`** in Vercel and redeploy.

✔ Open your address, sign in, and invite people.

## Updating later

Every `git push` to `main` updates the live site. If a change adds a database migration, apply it to
the live Supabase project **before** pushing (README → *Making changes and updating*).
