# ProjectHub

A private, invite-only project hub: projects, notes (with drawing), to-dos, meetings, files and
people in one place. Built with Next.js 16, Supabase and Tailwind CSS.

- **Everything about the app** (hosting, settings, security, database, how to release, Docker and
  Kubernetes, selling it): [PROJECTHUB.md](./PROJECTHUB.md)
- **How to test it**: [TESTING.md](./TESTING.md)

Quick start (Windows PowerShell, with `.env.local` filled in as described in PROJECTHUB.md):

```powershell
npm ci
npm run dev      # http://localhost:3000, uses the dev database
npm run check    # types, lint and tests
```

Never commit `.env.local`, `.env.docker` or `deploy/kubernetes/secret.env`.
