# Testing ProjectHub

There are three kinds of checks. Run the first one whenever you change code,
the second after every database change, and the third before you deploy.

## 1. Automated checks (one command)

```powershell
npm run check
```

This runs, in order:

| Command             | What it checks                                                        |
| ------------------- | --------------------------------------------------------------------- |
| `npm run typecheck` | The code fits together (types)                                        |
| `npm run lint`      | Common mistakes and React rules                                       |
| `npm test`          | The app's own logic: redirects stay on this site, notes move correctly, day groups and calendar, file names and allowed types, emails can't be tampered with, form rules, search links |

All green means it passed. A red ✗ shows the test name and what was expected.
`npm run test:watch` re-runs the tests every time you save a file.

The same checks run on GitHub on every push (the **Actions** tab, or the tick
or cross next to each commit).

## 2. Security check against the real database

`supabase/tests/security-check.sql` proves the database's own rules work on
your actual Supabase project. It creates throwaway test people and projects,
tries things as each of them (a member peeking at another project, someone
making themselves admin, a logged-out visitor, 2FA not entered…), then undoes
everything, so **nothing is saved**.

1. Supabase dashboard → your **dev** project → **SQL Editor** → **New query**
2. Paste the whole file and click **Run**
3. You should see one row: **ALL CHECKS PASSED**. An error starting with
   `FAIL:` says which rule broke.

Run it again after every `npx supabase db push --remote`, and once on the
production project after deploying.

## 3. Click-through checklist

Use two browsers (or a normal and a private window): you as admin, and a test
member invited to **one** project.

**Signing in**
- [ ] Wrong password → "That email/username or password is not correct."
- [ ] Sign in with your username and with your email
- [ ] As admin you're asked for your 2FA code
- [ ] Forgot password → link → new password → signed in (with Resend set up)

**Projects and home**
- [ ] Create, edit, archive and restore a project
- [ ] Today's to-dos and meetings appear on the sticky notes; ticking one crosses it out
- [ ] A very long to-do stays inside its sticky note

**Notes**
- [ ] New note, type, wait a moment, refresh: the text is still there
- [ ] Add a subpage; drag notes above/below others; hold on a note to put one inside; drag left to take it out

**To-dos and calendar**
- [ ] Add a to-do for today, one for Saturday, one with no day; tick one off and Undo
- [ ] Add a meeting; an end time before the start time is refused
- [ ] The Calendar shows both; clicking a day lists them

**Files**
- [ ] Upload a PDF and a photo; open the PDF; download it
- [ ] An .exe is refused with a clear message
- [ ] Make a folder, drag a file into it and back out; rename a file

**People and access**
- [ ] Invite the test member to one project; they set up their account from the link
- [ ] They see only that project in the sidebar, on the home page, in the calendar and in search
- [ ] Typing another project's address (`/projects/<id>`) as them shows "not found"
- [ ] They don't see People, New project, or project settings
- [ ] Give them a second project: it appears after a refresh. Remove them: they're signed out on their next click

**Search**
- [ ] Ctrl+K finds a note by a word inside it, a to-do, a meeting and a file
- [ ] As the test member, searching for something in a project they're not on finds nothing
