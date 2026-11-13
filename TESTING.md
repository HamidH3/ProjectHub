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
| `npm test`          | The app's own logic (99 tests): redirects stay on this site, notes move correctly and are split by writer, day groups and calendar, who a to-do can be assigned to, file names and allowed types, invite codes, emails can't be tampered with and don't name the admin, form rules, search links, drawing (saved drawings are checked, things stay on the page, select/move/resize/copy) |

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

1. Copy it: `Get-Content supabase\tests\security-check.sql -Raw -Encoding UTF8 | Set-Clipboard`
2. Supabase dashboard → your **dev** project → **SQL Editor** → **+** → **Create a new snippet**
   (not "logs query": that uses a different language and fails with "sql parser error")
3. Click in the editor, press Ctrl+A then Delete, paste with Ctrl+V and click **Run**. If it warns
   about "destructive operations", click **Run query**: it only touches its own test data and
   undoes everything.
4. You should see one row: **ALL CHECKS PASSED**. An error starting with
   `FAIL:` says which rule broke. A FAIL about a rule you've just added usually means that
   database change hasn't been pushed to this project yet (`npx supabase migration list --remote`).

Run it again after every `npx supabase db push --remote`, and once on the
production project after deploying.

## 3. Click-through checklist

Use two browsers (or a normal and a private window): you as admin, and a test
member invited to **one** project.

**Signing in**
- [ ] Wrong password → "That email/username or password is not correct."
- [ ] Sign in with your username and with your email
- [ ] As admin you're asked for your 2FA code
- [ ] Forgot password → email arrives → **Continue** → new password → signed in

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

**Invites and email**
- [ ] People page shows the green "emailed automatically" banner
- [ ] Invite a test address: the email arrives from "ProjectHub", says "You have been invited…",
      and doesn't show your name or address
- [ ] The link opens a page with a **Continue** button; pressing it lets them choose a username
- [ ] For someone who hasn't finished: **⋯ → New sign-up link** emails a fresh link; the old one
      stops working

**Assigning to-dos**
- [ ] As the member, add a to-do and assign it to you (the admin); you see "For you"
- [ ] **For me** shows only your to-dos; the to-do's editor says "Added by …"
- [ ] Take the member off the project: their to-dos there become unassigned

**Everyone's own notes**
- [ ] The member's notes appear under "<Name>'s notes", view only, for you
- [ ] Opening one shows "view only"; you can't type in it

**Drawing on notes**
- [ ] Pen, highlighter and eraser work with a mouse (and a finger on a phone)
- [ ] Paste a screenshot (Windows+Shift+S, then Ctrl+V on the note); drag it and resize it from
      the corner; it can't go off the paper
- [ ] Ctrl+Z undoes the last thing (drawing or text), Ctrl+Y redoes it
- [ ] Esc, then P / S / T switch tools; ? shows the shortcuts
- [ ] Refresh: the drawing and picture are still there; the member sees them in your note

**Themes and speed**
- [ ] Settings → Appearance: each theme changes the whole app straight away and is still set after
      a refresh; notes stay light paper with black writing
- [ ] Tapping between tabs shows the grey placeholder at once, then the content

**Search**
- [ ] Ctrl+K finds a note by a word inside it, a to-do, a meeting and a file
- [ ] As the test member, searching for something in a project they're not on finds nothing
