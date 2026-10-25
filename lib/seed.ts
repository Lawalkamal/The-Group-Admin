import { db } from './db';
import { LOCKED_PASSWORD_HASH, generateInviteCode, newId } from './store';
import type { User } from './session';

type SeedMember = { username: string; role: 'admin' | 'member' };

const DEMO_PEOPLE: Array<{ username: string; line: string }> = [
  { username: 'MamaRonke', line: 'Mama Ronke' },
  { username: 'NgoziO', line: 'Ngozi Okafor' },
  { username: 'TundeDJ', line: 'Tunde' },
  { username: 'UncleFemi', line: 'Uncle Femi' },
  { username: 'BlessingA', line: 'Blessing' },
];

async function ensureLockedUser(username: string): Promise<string> {
  const d = await db();
  const existing = await d.query<{ id: string }>('select id from users where username_lower = $1', [
    username.toLowerCase(),
  ]);
  if (existing[0]) return existing[0].id;

  const id = newId();
  await d.query(
    `insert into users (id, username, username_lower, password_hash)
     values ($1, $2, $3, $4)
     on conflict (username_lower) do nothing`,
    [id, username, username.toLowerCase(), LOCKED_PASSWORD_HASH],
  );
  const rows = await d.query<{ id: string }>('select id from users where username_lower = $1', [
    username.toLowerCase(),
  ]);
  return rows[0]?.id ?? id;
}

/**
 * The first account to register claims a ready-made group with history, so a
 * tester can invite someone immediately instead of starting from an empty room.
 * Returns the new group id, or null when another account already claimed it.
 */
export async function seedDemoGroupFor(owner: User): Promise<string | null> {
  const d = await db();
  const groupId = newId();

  // First writer wins; everyone else gets a clean empty state.
  const claim = await d.query<{ key: string }>(
    `insert into meta (key, value) values ('demo_group_id', $1)
     on conflict (key) do nothing
     returning key`,
    [groupId],
  );
  if (claim.length === 0) return null;

  try {
    const people = new Map<string, string>();
    for (const person of DEMO_PEOPLE) {
      people.set(person.username, await ensureLockedUser(person.username));
    }

    let code = generateInviteCode();
    const conflict = await d.query<{ id: string }>('select id from groups where invite_code = $1', [code]);
    if (conflict.length > 0) code = generateInviteCode();

    await d.query(
      'insert into groups (id, name, owner_id, invite_code) values ($1, $2, $3, $4)',
      [groupId, 'Adebayo @ 60 · Planning Committee', owner.id, code],
    );

    const memberships: SeedMember[] = [{ username: owner.username, role: 'admin' }];
    for (const person of DEMO_PEOPLE) memberships.push({ username: person.username, role: 'member' });

    for (const membership of memberships) {
      const userId =
        membership.username === owner.username ? owner.id : (people.get(membership.username) as string);
      await d.query('insert into memberships (group_id, user_id, role) values ($1, $2, $3)', [
        groupId,
        userId,
        membership.role,
      ]);
    }

    const eventAt = new Date();
    eventAt.setDate(eventAt.getDate() + 21);
    eventAt.setHours(16, 0, 0, 0);

    await d.query(
      `insert into plans (group_id, title, event_at, location_note, budget_note)
       values ($1, $2, $3, $4, $5)`,
      [
        groupId,
        'Chief Adebayo @ 60',
        eventAt.toISOString(),
        'The Grandeur, Ikeja',
        '₦2,400,000 pledged · ₦1,780,000 received · band deposit due Friday',
      ],
    );

    const venues: Array<{ name: string; note: string; proposedBy: string; voters: string[] }> = [
      {
        name: 'The Grandeur, Ikeja',
        note: '300 seats, parking, 6pm curfew',
        proposedBy: 'MamaRonke',
        voters: ['MamaRonke', 'NgoziO', 'UncleFemi'],
      },
      {
        name: "Mama's compound, Surulere",
        note: 'Free. Uncle Femi can supply the canopies.',
        proposedBy: 'UncleFemi',
        voters: ['UncleFemi', 'BlessingA'],
      },
      {
        name: 'Balmoral Hall, VI',
        note: 'Beautiful, but the deposit is due tomorrow.',
        proposedBy: 'NgoziO',
        voters: ['NgoziO'],
      },
    ];

    for (const venue of venues) {
      const venueId = newId();
      await d.query(
        'insert into venues (id, group_id, name, note, proposed_by) values ($1, $2, $3, $4, $5)',
        [venueId, groupId, venue.name, venue.note, people.get(venue.proposedBy)],
      );
      for (const voter of venue.voters) {
        await d.query('insert into venue_votes (venue_id, user_id) values ($1, $2)', [
          venueId,
          people.get(voter),
        ]);
      }
    }

    const rsvps: Array<[string, string]> = [
      ['MamaRonke', 'yes'],
      ['NgoziO', 'yes'],
      ['UncleFemi', 'yes'],
      ['BlessingA', 'yes'],
      ['TundeDJ', 'maybe'],
    ];
    for (const [username, status] of rsvps) {
      await d.query('insert into rsvps (group_id, user_id, status) values ($1, $2, $3)', [
        groupId,
        people.get(username),
        status,
      ]);
    }

    // A ready-made shared goal so the new activity is visible on a fresh
    // database. Existing databases are never reseeded.
    const activityId = newId();
    const activityAt = new Date(Date.now() - 95 * 60_000).toISOString();
    await d.query(
      `insert into activities (id, group_id, kind, scenario, title, goal, status, created_by, created_at)
       values ($1, $2, 'shared_goal', 'night_market', 'Night Market Takeover', 100, 'active', $3, $4)`,
      [activityId, groupId, people.get('MamaRonke'), activityAt],
    );

    const activityMoves: Array<{ username: string; action: string; points: number; note: string }> = [
      {
        username: 'MamaRonke',
        action: 'scout',
        points: 15,
        note: 'Found the corner beside the pepper stall. Good traffic.',
      },
      {
        username: 'NgoziO',
        action: 'cook',
        points: 20,
        note: 'Test batch finished. Nobody complained, which is suspicious.',
      },
      {
        username: 'BlessingA',
        action: 'sign',
        points: 10,
        note: 'The sign is loud. You will see it from the road.',
      },
    ];
    for (const [index, move] of activityMoves.entries()) {
      await d.query(
        `insert into activity_contributions (id, activity_id, user_id, action_id, points, note, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId(),
          activityId,
          people.get(move.username),
          move.action,
          move.points,
          move.note,
          new Date(Date.now() - (92 - index * 3) * 60_000).toISOString(),
        ],
      );
    }
    for (const username of ['TundeDJ', 'UncleFemi']) {
      await d.query(
        `insert into activity_cheers (activity_id, user_id, action_id)
         values ($1, $2, 'rally')`,
        [activityId, people.get(username)],
      );
    }

    const script: Array<{ from: string | null; body: string; minutesAgo: number }> = [
      { from: null, body: 'Mama Ronke started the group.', minutesAgo: 190 },
      { from: 'MamaRonke', body: 'Good evening everybody. We have 21 days. I have said it, I will say it again: this party must not disgrace us.', minutesAgo: 188 },
      { from: 'NgoziO', body: 'Before anybody books anything — ₦1.78m received. Band deposit alone is ₦600k. Receipts or it did not happen.', minutesAgo: 181 },
      { from: 'TundeDJ', body: 'My set is 50% upfront and I need the tables near the stage. Sound is a personality, not a service.', minutesAgo: 174 },
      { from: 'UncleFemi', body: 'I am only observing. But the parking must be sorted before 4pm, and no pepper in the small chops.', minutesAgo: 168 },
      { from: 'BlessingA', body: 'I am bringing six people and the recap video will be on TikTok by midnight. This is not negotiable 😅', minutesAgo: 159 },
      { from: 'MamaRonke', body: 'I have put the three venues in the plan. Vote. I want a decision before Sunday.', minutesAgo: 151 },
      { from: 'BlessingA', body: 'Voted for Surulere. It is free and we can make noise until 3am.', minutesAgo: 143 },
      { from: 'NgoziO', body: 'A party is not a reason to lose ₦800k on a hall. Look at the numbers first.', minutesAgo: 130 },
      { from: 'UncleFemi', body: 'If it is Surulere, I am controlling the gate myself.', minutesAgo: 118 },
      {
        from: null,
        body: 'Mama Ronke started a shared goal: Night Market Takeover (100 points).',
        minutesAgo: 95,
      },
      {
        from: 'MamaRonke',
        body: 'I have started a small goal for the night market. Add your bit when you can — points only, no money involved.',
        minutesAgo: 90,
      },
    ];

    for (const line of script) {
      const authorId = line.from ? (people.get(line.from) as string) : null;
      await d.query(
        `insert into messages (id, group_id, author_id, kind, body, created_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          newId(),
          groupId,
          authorId,
          authorId ? 'user' : 'system',
          line.body,
          new Date(Date.now() - line.minutesAgo * 60_000).toISOString(),
        ],
      );
    }

    await d.query(
      `insert into messages (id, group_id, author_id, kind, body, created_at)
       values ($1, $2, null, 'system', $3, now())`,
      [
        newId(),
        groupId,
        `${owner.username} is the admin here. Share the invite code to bring people in.`,
      ],
    );

    return groupId;
  } catch (error) {
    await d.query("delete from meta where key = 'demo_group_id'", []);
    console.error('[seed] failed', error);
    return null;
  }
}
