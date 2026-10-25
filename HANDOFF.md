# Where this stands, and what you need to do

Milestone three is built and passing every local check. This file explains what changed,
what was proven, what decisions were made, and the exact steps on **your** end.

---

## 1. What this milestone changed

The visual design, mobile shell, auth, invite codes, free-text chat and party plan are all
unchanged. The app now supports more than party planning:

- **Invite-only is still the default.** Every group keeps its eight-character code and
  `/join/<code>` link.
- **Discoverable communities + Explore.** A group's admin can switch it to discoverable from
  People → Community. It then appears in the new **Explore** area, where any signed-in player
  can join without a code. The admin can switch it back to invite-only at any time.
- **Shared Goal**, a fictional non-party activity started from the chat:
  - Pick one of four scenarios (night market, road trip, neighbourhood festival, pop-up shop).
  - Pick a point goal: 50, 100 or 200.
  - Members take actions once each and cheer the action the group should take next.
  - Progress, each person's points/moves, the group's pick, and a short outcome are shown.
  - Finishing the goal moves it to the group's history; the admin or creator can also close
    an unfinished goal early.
  - **All points are fictional.** There is no money, token, wallet, cash-out, purchase, prize,
    or real-world value. Cheering is free.
- **Safety controls.** Members can report or block another member from the People sheet.
  Reports are visible only to the group admin; blocking hides that person's chat messages
  from the blocker. Admin removal already existed and still revokes access immediately.
- **Two consistency fixes:**
  - Every group card now shows the invite code fetched for that group, and the list refreshes
    after a rotation. The code on the card and the code in People & Invite always come from
    the same record.
  - Removal now clears that person's current RSVP and venue votes, and the plan query also
    filters them out defensively. Past messages and shared-goal contributions remain as
    group history.

Database changes are **additive only**: two new columns on `groups` plus new activity,
contribution, cheer, report and block tables. Existing accounts, groups, messages and plans
are untouched. No reseed or reset was run.

## 2. What was verified

| Check | Result |
|---|---|
| `npm run check` (TypeScript + 39 unit tests) | ✅ exit 0, 39/39 |
| `npm run test:e2e` (three accounts over real HTTP) | ✅ **73/73 checks passed** |
| `npm run build` | ✅ exit 0, all routes generated |
| Real browser, 1500×1040 and 430×932 | ✅ new screens render, console clean |
| Discoverable group appears in Explore, invites stay hidden | ✅ |
| Join an open community without a code | ✅ |
| Non-admin cannot change visibility or read reports | ✅ |
| Report → admin sees it → mark handled | ✅ |
| Block hides messages; unblock restores them | ✅ |
| Shared goal: start, contribute, cheer, complete, history, close early | ✅ |
| Removal clears RSVP and venue votes | ✅ |
| Invite code on card matches People & Invite, including after rotation | ✅ |
| Existing database upgraded in place (the checks ran against it) | ✅ |

The e2e run covers the whole flow, including the two bugs you reported. Its final cleanup
switches its own discoverable test group back to invite-only so it does not linger in Explore.

Screenshots of the real UI are in [`screenshots/`](screenshots/). The most useful ones:

- [`13-chat.png`](screenshots/13-chat.png) — chat with both the party plan and shared goal strips
- [`14-activity.png`](screenshots/14-activity.png) — shared goal progress, actions and cheers
- [`16-explore.png`](screenshots/16-explore.png) — Explore
- [`15-people.png`](screenshots/15-people.png) — community settings, reports and member actions
- [`19-start-goal.png`](screenshots/19-start-goal.png) — starting a goal (unreachable targets disabled)

## 3. What you need to do

### A. Run it locally

```bash
npm run dev
```

That starts the embedded Postgres and the app at <http://localhost:3000>. **Do not reset the
database.** The first request adds the new columns/tables in place; your existing accounts,
groups and plans keep working.

Try this flow:

1. Sign in with an existing account (or create one).
2. Open a group → People → Community → switch it to **Discoverable**.
3. Open a second browser/incognito window, sign in as someone else, and go to **Explore**
   from the home screen. The group should be there; join it without a code.
4. In the group chat, tap **Start a shared goal**, pick a scenario and a reachable target,
   then take an action or cheer one. Open a second account to see the progress update.
5. From People, use the `⋯` menu on a member to report or block them. The admin sees reports
   in the same sheet.
6. Remove a member and check the plan's RSVP list: they no longer appear. Their old messages
   stay in the chat.

### B. Deploy

There are **no new environment variables or services**. The existing Neon + Vercel setup is
unchanged:

1. Push this version to your repository.
2. Let Vercel redeploy, or trigger a redeploy manually.
3. `DATABASE_URL` stays exactly as it is.
4. On the first request after deploy, the additive schema changes run automatically.

Before deploying against a database you care about, take a Neon branch or backup — not because
this change deletes data (it does not), but because schema changes on a live database should
always have a rollback point. **Do not run `npm run db:reset` against production.**

If you have not deployed yet, the full sequence remains: git repo → Neon database (copy the
pooled connection string) → import to Vercel → add `DATABASE_URL` → deploy.

### C. Test on a phone

Below 700px the iPhone frame disappears and the app fills the screen with safe-area insets.
The new Explore and goal sheets are designed at that width too.

## 4. Decisions and limits

- **Reports are group-local.** Only that group's admin sees them; there is no platform-wide
  moderation queue. If the admin is the abuser, a member can block them, but nobody above the
  admin reviews the report.
- **Blocking hides chat only.** It hides the blocked person's chat messages and previews from
  the blocker. It does not remove them from the group, hide their shared-goal contributions,
  or change what other members see. Admin removal is the stronger action.
- **Removal history:** current RSVP and venue votes are cleared; past chat and shared-goal
  contributions stay. This is deliberate so the plan does not claim someone is attending when
  they have lost access.
- **One shared goal at a time per group.** Finished goals are kept in history (up to eight in
  the sheet). There is no second plan or second active activity yet.
- **Solo groups** cannot reach a 100-point goal; the start form disables unreachable targets
  and defaults to 50 points. A group whose membership shrinks can close the goal early.
- **Polling, not realtime.** Messages, plan, goal and blocks refresh every two seconds while
  the tab is visible. Fine for a handful of testers; sockets would be the next step.
- **One admin per group**, no ownership transfer, no password reset, no attachments or
  notifications.
- **Test data in this local database:** the e2e and visual checks created accounts such as
  `VisualAda`, `VisualTunde`, `VisualGuest`, plus test groups. They live only in `.data/`.
  They are harmless, but you can remove the whole local database with `npm run db:reset` if
  you want a clean slate (this is local-only and deletes everything).

## 5. What was not verified

- **Production deployment.** That depends on your Vercel/Neon accounts, so the deploy steps
  above are untested by me. The build and all runtime checks pass locally.
- **The seeded demo group on a brand-new database.** This development database already had a
  claimed demo group, so the new seeded Night Market goal was not exercised here. The code is
  typechecked, and a newly created group was used for every shared-goal e2e check. If you
  reset a *scratch* database, the first account should see the demo group with the goal
  already running; treat that as the one path that still needs a quick manual look.
- **Long-running load.** The polling/e2e checks cover a handful of users, not dozens.

## 6. Commands

```bash
npm run dev        # local app + embedded database → localhost:3000
npm run check      # typecheck + unit tests
npm run test:e2e   # 73-check acceptance run (needs the dev server running)
npm run build      # production build
npm run db:reset   # LOCAL ONLY: wipe the embedded database
```

Full documentation is in [`README.md`](README.md). The bottom line: your only required work
is redeploying the existing Vercel project (no new env vars) and, optionally, a quick look at
the seeded demo path on a scratch database.
