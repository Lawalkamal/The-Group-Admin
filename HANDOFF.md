# Where this stands, and what you need to do

The invite-only group MVP is built and passing every check. This file explains what exists
right now, what was proven, and the exact steps on **your** end — from running it locally to
putting it in front of your invited testers.

---

## 1. What the app is now

Milestone two replaced the single-player prototype with a real multi-user product:

- **Accounts** — username + password (no email needed). Passwords are salted PBKDF2 hashes;
  sessions live only in an `HttpOnly` cookie.
- **Groups** — anyone can create one; the creator is the admin.
- **Invite codes** — every group has an 8-character code plus a `/join/<code>` link. Anyone
  holding it joins instantly. The admin can rotate the code (killing the old one) or remove people.
- **Chat** — messages plus system events, refreshed every 2 seconds by polling, paused when
  the tab is hidden.
- **One party plan per group** — admin sets date + budget, everyone proposes venues, votes,
  RSVPs, and the admin locks it when the group decides.
- **Server + database** — Next.js 16 (App Router) with a Postgres database. Locally that's an
  embedded Postgres so you install nothing; in production it's any standard Postgres
  (Neon free tier is the intended target).

The old single-player game is deleted — that was your instruction.

## 2. What was verified (so you don't have to guess)

| Check | Result |
|---|---|
| `npm run check` (TypeScript + 29 unit tests) | ✅ exit 0, 29/29 |
| `npm run test:e2e` (three real accounts over HTTP) | ✅ 32/32 |
| `npm run build` | ✅ exit 0 |
| Two accounts in a real browser (desktop 1500×1040, mobile 430×932) | ✅ messages flow both ways, console clean |
| Kill the app **and** the database, restart, log back in | ✅ group and messages still there |
| Non-member probing a group | ✅ gets `404`, can't tell it exists |
| Rotating an invite code | ✅ old code dies immediately |

Last run of all three checks after the final edits: passing as of today.

Screenshots of the real UI are in [`screenshots/`](screenshots/) — start with
[`07-two-accounts.png`](screenshots/07-two-accounts.png) (two accounts in one group) and
[`03-plan.png`](screenshots/03-plan.png) (the party plan).

---

## 3. What you need to do

### A. Run it on your machine (do this first)

```bash
npm run dev
```

That one command starts the embedded Postgres **and** the app. Open
<http://localhost:3000>.

- **First account you create claims the seeded demo group**, so you land in a group that
  already has history and an invite code. That's intentional.
- Any account after that starts empty — sign up a second time in a different browser or an
  incognito window to see the "create a group" path and to test chatting between two people.
- Data lives in `.data/` and survives restarts. `npm run db:reset` wipes it clean if you
  want a fresh start.

Try this flow: create account → copy the invite code → open an incognito window → create a
second account → paste the code → say something in each window and watch it appear in the other.

### B. Put it online for your invited testers

You told me the folder is not a git repository, so **nothing has been committed or pushed** —
this step is entirely yours because it involves your accounts.

1. **Make a git repo and push it** (GitHub is fine):
   ```bash
   git init
   git add .
   git commit -m "Invite-only group MVP"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
   `.gitignore` already excludes `.data/`, `node_modules/`, `.env*` and build output, so no
   secrets or local data go up.

2. **Create a Postgres database.** [Neon](https://neon.tech) free tier is the target — create
   a project and copy the **pooled** connection string (it looks like
   `postgresql://user:...@host/db?sslmode=require`).

3. **Import the repo into [Vercel](https://vercel.com).** Build command stays `npm run build`;
   no other configuration.

4. **Add one environment variable** in Vercel → Project → Settings → Environment Variables:
   - `DATABASE_URL` = the pooled Neon string from step 2.

5. **Deploy.** Tables create themselves on the first request — there is no migration step to run.

6. **Share the invite.** Sign up as the admin, create the group, send people the 8-character
   code or the `/join/<code>` link. That link is all a tester needs.

Also copy [`.env.example`](.env.example) to `.env.local` only if you want to point `npm run dev`
at an external database instead of the embedded one — otherwise you can ignore it.

### C. Test on a phone

Below 700px the phone frame disappears and the app fills the screen with safe-area insets, so
it behaves like a real iOS/Android app. On desktop it renders inside an iPhone 14 Pro Max shell.

---

## 4. Decisions and limits you should know

**Deliberately not built** (per the brief's scope): email login, password reset, notifications,
file uploads/attachments, payments, public group discovery, AI replies.

**Consequences of those choices:**

- **No password reset** — if a tester forgets their password you'd have to create them a new
  account. Fine for a handful of invited people; the first thing to add if this grows.
- **Polling, not realtime** — messages appear within ~2 seconds. Great for a few testers; if
  people complain about lag, the fix is server-sent events (or Durable Objects on Vercel).
- **One admin per group, one plan per group** — no ownership transfer, and a group can't hold
  a second event's plan yet. Both are natural next milestones.
- **The first account in each database claims the demo group** — on a fresh production
  database that will be you, which is what you want.

**Operational notes:**

- Local app = port 3000, local database = port 5433. If a previous run is still holding them,
  `npm run dev` reuses them; if a start fails, check for an orphaned node process and kill it.
- If weird data appears, `npm run db:reset` then `npm run dev` gives you a clean slate.
- Chat rate limit: 20 messages/minute/person/group; 1000 characters max per message.

---

## 5. Commands cheat-sheet

```bash
npm run dev        # local app + embedded database → localhost:3000
npm run check      # typecheck + unit tests
npm run test:e2e   # 32-check acceptance run (needs the dev server running)
npm run build      # production build
npm run db:reset   # wipe local data
```

Full documentation lives in [`README.md`](README.md); the security details are in its
"Authentication" section.

**Bottom line:** your only real work is steps B1–B5 (git → Neon → Vercel → `DATABASE_URL`).
Everything the app does has already been verified locally, end to end.
