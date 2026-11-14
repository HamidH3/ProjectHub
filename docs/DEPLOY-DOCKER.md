# Running ProjectHub with Docker

For your own server, a cloud VM, or a company machine. The app keeps nothing on its own disk
(everything is in Supabase), so a container can be replaced at any time. Do README Steps 1–6 first
(they set up Supabase and the database).

**You need:** [Docker](https://docs.docker.com/get-docker/) with Docker Compose (Docker Desktop on
Windows/macOS; Docker Engine on Linux), and the project folder on that machine.

## 1. Create the settings file

```bash
npm run setup -- --for docker
```

(No Node.js on the server? Copy `.env.docker.example` to `.env.docker` and fill it in by hand.)
For a server reached by a domain name, answer the address question with `https://your-domain`.

Check it:

```bash
npm run doctor -- --file .env.docker
```

## 2. Build and start

```bash
docker compose --env-file .env.docker up -d --build
```

The first build takes a few minutes. ✔ `docker compose ps` shows the container as **healthy** after
about 30 seconds, and **http://localhost:3000** (on that machine) shows the sign-in page.

The two `NEXT_PUBLIC_` values are built into the image (they're public), so an image belongs to one
Supabase project. Everything secret is only given when the container starts.

## 3. HTTPS (needed for real use)

Sign-in cookies and the meeting recorder need HTTPS. Two ways:

**A. Built-in option (Caddy, free certificates).** On a server with a domain name:
1. Point the domain's DNS (an *A record*) at the server's IP address; open ports **80** and **443**.
2. Add to `.env.docker`: `DOMAIN=projecthub.yourcompany.com` and make sure
   `SITE_URL=https://projecthub.yourcompany.com`.
3. Start with both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml --env-file .env.docker up -d --build
```

Caddy gets and renews the certificate by itself (`deploy/docker/Caddyfile`).

**B. Your own proxy or load balancer** (nginx, Traefik, a cloud load balancer): send traffic to the
container's port 3000 and terminate HTTPS there.

Then in Supabase → **Authentication → URL Configuration**: set **Site URL** to your address and add
`https://your-domain/**` to **Redirect URLs**.

## 4. First admin and tidying up

If this Supabase project has no admin yet, open `https://your-domain/setup` with the `SETUP_TOKEN`
from `.env.docker`. Afterwards delete the `SETUP_TOKEN` line and restart:
`docker compose --env-file .env.docker up -d`.

## Everyday Docker commands

| What | Command |
|---|---|
| See if it's running and healthy | `docker compose ps` |
| See its log | `docker compose logs -f projecthub` |
| Restart after changing `.env.docker` | `docker compose --env-file .env.docker up -d` |
| Update to a new version of the code | replace the files, then `docker compose --env-file .env.docker up -d --build` |
| Stop it | `docker compose down` |

(Using HTTPS option A? Add `-f docker-compose.yml -f docker-compose.https.yml` after `docker compose`.)

## Building by hand (without Compose)

```bash
docker build -t projecthub \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... .
docker run -d -p 3000:3000 --env-file .env.docker --read-only \
  --tmpfs /tmp --tmpfs /app/.next/cache --cap-drop ALL projecthub
```

## What's in the image

- Runs as a normal (non-root) user, with a read-only file system except `/tmp` and the Next.js
  cache, and no extra Linux permissions.
- Contains only the built server: no source code, no `.env` files, no docs or scripts.
- Has a health check on `/login` (it follows the `PORT` setting if you change it).
- Needs outgoing HTTPS (port 443) to Supabase; to the mail server for email (465 for Gmail); and to
  Recall.ai and api.anthropic.com if you use the meeting recorder.
