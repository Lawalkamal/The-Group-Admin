import { db } from './db';
import { ApiError } from './http';
import { generateInviteCode, newId } from './ids';
import type { RsvpStatus } from './validate';
import type {
  ChatMessage,
  GroupRole,
  GroupSnapshot,
  GroupSummary,
  Member,
  Plan,
  Rsvp,
  SyncPayload,
  Venue,
} from './types';

const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_MESSAGES = 20;

export { generateInviteCode, newId };

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(String(value)).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

function toNum(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

type MembershipRow = { role: string; joined_at: unknown };

export async function getMembership(
  groupId: string,
  userId: string,
): Promise<{ role: GroupRole; joinedAt: string } | null> {
  const rows = await (await db()).query<MembershipRow>(
    'select role, joined_at from memberships where group_id = $1 and user_id = $2',
    [groupId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { role: row.role === 'admin' ? 'admin' : 'member', joinedAt: toIso(row.joined_at) };
}

/**
 * Non-members get a 404 rather than a 403 so membership cannot be probed.
 */
export async function requireMembership(
  groupId: string,
  userId: string,
): Promise<{ role: GroupRole; joinedAt: string }> {
  const membership = await getMembership(groupId, userId);
  if (!membership) throw new ApiError(404, 'That group is not available to you.', 'not_found');
  return membership;
}

export async function requireAdmin(
  groupId: string,
  userId: string,
): Promise<{ role: GroupRole; joinedAt: string }> {
  const membership = await requireMembership(groupId, userId);
  if (membership.role !== 'admin') {
    throw new ApiError(403, 'Only the group admin can do that.', 'forbidden');
  }
  return membership;
}

export async function getGroupName(groupId: string): Promise<string | null> {
  const rows = await (await db()).query<{ name: string }>('select name from groups where id = $1', [groupId]);
  return rows[0]?.name ?? null;
}

export async function getGroupByCode(code: string): Promise<{ id: string; name: string } | null> {
  const rows = await (await db()).query<{ id: string; name: string }>(
    'select id, name from groups where invite_code = $1',
    [code],
  );
  return rows[0] ?? null;
}

export async function getMembers(groupId: string): Promise<Member[]> {
  const rows = await (await db()).query<{
    id: string;
    username: string;
    role: string;
    joined_at: unknown;
  }>(
    `select u.id, u.username, m.role, m.joined_at
       from memberships m
       join users u on u.id = m.user_id
      where m.group_id = $1
      order by case when m.role = 'admin' then 0 else 1 end, m.joined_at asc`,
    [groupId],
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role === 'admin' ? 'admin' : 'member',
    joinedAt: toIso(row.joined_at),
  }));
}

type MessageRow = {
  seq: unknown;
  id: string;
  kind: string;
  body: string;
  author_id: string | null;
  author_name: string | null;
  created_at: unknown;
};

function mapMessage(row: MessageRow): ChatMessage {
  return {
    seq: toNum(row.seq),
    id: row.id,
    kind: row.kind === 'system' ? 'system' : 'user',
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: toIso(row.created_at),
  };
}

const MESSAGE_SELECT = `
  select m.seq, m.id, m.kind, m.body, m.author_id, u.username as author_name, m.created_at
    from messages m
    left join users u on u.id = m.author_id
`;

export async function getRecentMessages(groupId: string, limit = 200): Promise<ChatMessage[]> {
  const rows = await (await db()).query<MessageRow>(
    `${MESSAGE_SELECT} where m.group_id = $1 order by m.seq desc limit ${Math.max(1, Math.min(limit, 500))}`,
    [groupId],
  );
  return rows.map(mapMessage).reverse();
}

export async function getMessagesAfter(groupId: string, afterSeq: number, limit = 200): Promise<ChatMessage[]> {
  const rows = await (await db()).query<MessageRow>(
    `${MESSAGE_SELECT} where m.group_id = $1 and m.seq > $2 order by m.seq asc limit ${Math.max(1, Math.min(limit, 500))}`,
    [groupId, afterSeq],
  );
  return rows.map(mapMessage);
}

export async function getLastSeq(groupId: string): Promise<number> {
  const rows = await (await db()).query<{ seq: unknown }>(
    'select coalesce(max(seq), 0) as seq from messages where group_id = $1',
    [groupId],
  );
  return toNum(rows[0]?.seq ?? 0);
}

export async function postSystemMessage(groupId: string, body: string): Promise<void> {
  await (await db()).query(
    `insert into messages (id, group_id, author_id, kind, body, created_at)
     values ($1, $2, null, 'system', $3, now())`,
    [newId(), groupId, body],
  );
}

export async function postMessage(
  groupId: string,
  author: { id: string; username: string },
  body: string,
): Promise<ChatMessage> {
  const d = await db();

  const recent = await d.query<{ n: unknown }>(
    `select count(*) as n from messages
      where group_id = $1 and author_id = $2 and created_at > now() - interval '${RATE_WINDOW_SECONDS} seconds'`,
    [groupId, author.id],
  );
  if (toNum(recent[0]?.n ?? 0) >= RATE_MAX_MESSAGES) {
    throw new ApiError(429, 'Slow down a moment — too many messages.', 'rate_limited');
  }

  const id = newId();
  const rows = await d.query<{ seq: unknown; created_at: unknown }>(
    `insert into messages (id, group_id, author_id, kind, body, created_at)
     values ($1, $2, $3, 'user', $4, now())
     returning seq, created_at`,
    [id, groupId, author.id, body],
  );
  const row = rows[0];
  return {
    seq: toNum(row?.seq ?? 0),
    id,
    kind: 'user',
    body,
    authorId: author.id,
    authorName: author.username,
    createdAt: toIso(row?.created_at ?? new Date()),
  };
}

export async function createGroup(owner: { id: string; username: string }, name: string): Promise<GroupSnapshot> {
  const d = await db();
  let groupId = newId();
  let code = generateInviteCode();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await d.query(
        'insert into groups (id, name, owner_id, invite_code) values ($1, $2, $3, $4)',
        [groupId, name, owner.id, code],
      );
      break;
    } catch (error) {
      const code_ = (error as { code?: string }).code;
      if (code_ !== '23505' || attempt === 4) throw error;
      groupId = newId();
      code = generateInviteCode();
    }
  }

  await d.query(
    "insert into memberships (group_id, user_id, role) values ($1, $2, 'admin')",
    [groupId, owner.id],
  );
  await d.query('insert into plans (group_id) values ($1)', [groupId]);
  await postSystemMessage(groupId, `${owner.username} started the group.`);

  return getSnapshot(groupId, owner.id);
}

export async function joinByCode(
  user: { id: string; username: string },
  code: string,
): Promise<{ groupId: string; name: string; joined: boolean }> {
  const group = await getGroupByCode(code);
  if (!group) throw new ApiError(404, 'That invite code does not match a group.', 'not_found');

  const inserted = await (await db()).query<{ user_id: string }>(
    `insert into memberships (group_id, user_id, role) values ($1, $2, 'member')
     on conflict (group_id, user_id) do nothing
     returning user_id`,
    [group.id, user.id],
  );

  const joined = inserted.length > 0;
  if (joined) {
    await postSystemMessage(group.id, `${user.username} joined the group.`);
    await ensureDemoIntroFor(group.id, user.username);
  }
  return { groupId: group.id, name: group.name, joined };
}

/** Adds a gentle orientation line the first time a real person joins a seeded group. */
async function ensureDemoIntroFor(groupId: string, username: string): Promise<void> {
  const d = await db();
  const rows = await d.query<{ n: unknown }>(
    "select count(*) as n from messages where group_id = $1 and body like 'The plan for%'",
    [groupId],
  );
  if (toNum(rows[0]?.n ?? 0) > 0) return;
  await postSystemMessage(
    groupId,
    `The plan for the party is pinned at the top. ${username}, add a venue or RSVP when you can.`,
  );
}

export async function rotateInviteCode(groupId: string): Promise<string> {
  const d = await db();
  let code = generateInviteCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await d.query('update groups set invite_code = $1 where id = $2', [code, groupId]);
      return code;
    } catch (error) {
      if ((error as { code?: string }).code !== '23505' || attempt === 4) throw error;
      code = generateInviteCode();
    }
  }
  return code;
}

export async function listGroups(userId: string): Promise<GroupSummary[]> {
  const rows = await (await db()).query<{
    id: string;
    name: string;
    invite_code: string;
    role: string;
    member_count: unknown;
    last_body: string | null;
    last_at: unknown;
    event_at: unknown;
    finalized_at: unknown;
    created_at: unknown;
  }>(
    `select g.id, g.name, g.invite_code, m.role,
            (select count(*) from memberships x where x.group_id = g.id) as member_count,
            (select mm.body from messages mm where mm.group_id = g.id order by mm.seq desc limit 1) as last_body,
            (select mm.created_at from messages mm where mm.group_id = g.id order by mm.seq desc limit 1) as last_at,
            p.event_at, p.finalized_at, g.created_at
       from groups g
       join memberships m on m.group_id = g.id and m.user_id = $1
       left join plans p on p.group_id = g.id`,
    [userId],
  );

  const memberRows = await (await db()).query<{ group_id: string; username: string }>(
    `select m.group_id, u.username
       from memberships m
       join users u on u.id = m.user_id
      where m.group_id in (select group_id from memberships where user_id = $1)
      order by case when m.role = 'admin' then 0 else 1 end, m.joined_at asc`,
    [userId],
  );

  const summaries = rows.map((row) => ({
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    role: row.role === 'admin' ? ('admin' as const) : ('member' as const),
    memberCount: toNum(row.member_count),
    memberNames: memberRows.filter((member) => member.group_id === row.id).map((member) => member.username),
    lastMessage: row.last_body,
    lastAt: toIsoOrNull(row.last_at),
    eventAt: toIsoOrNull(row.event_at),
    finalizedAt: toIsoOrNull(row.finalized_at),
  }));

  summaries.sort((a, b) => {
    const aTime = new Date(a.lastAt ?? 0).getTime();
    const bTime = new Date(b.lastAt ?? 0).getTime();
    return bTime - aTime;
  });
  return summaries;
}

async function ensurePlanRow(groupId: string): Promise<void> {
  await (await db()).query('insert into plans (group_id) values ($1) on conflict (group_id) do nothing', [groupId]);
}

export async function getPlan(groupId: string): Promise<Plan> {
  await ensurePlanRow(groupId);
  const d = await db();

  const planRows = await d.query<{
    title: string;
    event_at: unknown;
    location_note: string;
    budget_note: string;
    finalized_at: unknown;
  }>(
    'select title, event_at, location_note, budget_note, finalized_at from plans where group_id = $1',
    [groupId],
  );
  const plan = planRows[0];

  const venueRows = await d.query<{
    id: string;
    name: string;
    note: string;
    proposed_by: string | null;
    proposed_by_name: string | null;
  }>(
    `select v.id, v.name, v.note, v.proposed_by, u.username as proposed_by_name
       from venues v
       left join users u on u.id = v.proposed_by
      where v.group_id = $1
      order by v.created_at asc, v.name asc`,
    [groupId],
  );

  const voteRows = await d.query<{ venue_id: string; user_id: string }>(
    `select vv.venue_id, vv.user_id
       from venue_votes vv
       join venues v on v.id = vv.venue_id
      where v.group_id = $1`,
    [groupId],
  );

  const rsvpRows = await d.query<{ user_id: string; username: string; status: string }>(
    `select r.user_id, u.username, r.status
       from rsvps r
       join users u on u.id = r.user_id
      where r.group_id = $1
      order by r.updated_at asc`,
    [groupId],
  );

  const venues: Venue[] = venueRows.map((row) => ({
    id: row.id,
    name: row.name,
    note: row.note,
    proposedBy: row.proposed_by,
    proposedByName: row.proposed_by_name,
    voters: voteRows.filter((vote) => vote.venue_id === row.id).map((vote) => vote.user_id),
  }));

  const rsvps: Rsvp[] = rsvpRows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    status: (row.status === 'maybe' || row.status === 'no' ? row.status : 'yes') as RsvpStatus,
  }));

  return {
    title: plan?.title ?? 'Party plan',
    eventAt: toIsoOrNull(plan?.event_at),
    locationNote: plan?.location_note ?? '',
    budgetNote: plan?.budget_note ?? '',
    finalizedAt: toIsoOrNull(plan?.finalized_at),
    venues,
    rsvps,
  };
}

async function assertPlanOpen(groupId: string): Promise<void> {
  await ensurePlanRow(groupId);
  const rows = await (await db()).query<{ finalized_at: unknown }>(
    'select finalized_at from plans where group_id = $1',
    [groupId],
  );
  if (rows[0]?.finalized_at) {
    throw new ApiError(409, 'The plan is locked — the admin already confirmed it.', 'plan_locked');
  }
}

export async function updatePlan(
  actor: { id: string; username: string },
  groupId: string,
  patch: { title?: string; eventAt?: string | null; locationNote?: string; budgetNote?: string },
): Promise<Plan> {
  await requireAdmin(groupId, actor.id);
  await assertPlanOpen(groupId);

  const current = await getPlan(groupId);
  const title = patch.title ?? current.title;
  const eventAt = patch.eventAt === undefined ? current.eventAt : patch.eventAt;
  const locationNote = patch.locationNote ?? current.locationNote;
  const budgetNote = patch.budgetNote ?? current.budgetNote;

  await (await db()).query(
    `update plans
        set title = $2, event_at = $3, location_note = $4, budget_note = $5, updated_at = now()
      where group_id = $1`,
    [groupId, title, eventAt, locationNote, budgetNote],
  );

  if (patch.eventAt !== undefined) {
    const when = eventAt ? new Date(eventAt).toISOString().slice(0, 10) : null;
    await postSystemMessage(
      groupId,
      when ? `${actor.username} set the date for ${when}.` : `${actor.username} cleared the date.`,
    );
  }
  if (patch.budgetNote !== undefined) {
    await postSystemMessage(groupId, `${actor.username} updated the budget note.`);
  }

  return getPlan(groupId);
}

export async function addVenue(
  actor: { id: string; username: string },
  groupId: string,
  name: string,
  note: string,
): Promise<Plan> {
  await requireMembership(groupId, actor.id);
  await assertPlanOpen(groupId);

  const d = await db();
  const existing = await d.query<{ n: unknown }>(
    'select count(*) as n from venues where group_id = $1',
    [groupId],
  );
  if (toNum(existing[0]?.n ?? 0) >= 12) {
    throw new ApiError(409, 'Twelve venues is plenty — vote on those first.', 'too_many_venues');
  }

  const duplicate = await d.query<{ id: string }>(
    'select id from venues where group_id = $1 and lower(name) = lower($2)',
    [groupId, name],
  );
  if (duplicate.length > 0) {
    throw new ApiError(409, 'That venue is already on the list.', 'duplicate_venue');
  }

  const venueId = newId();
  await d.query(
    'insert into venues (id, group_id, name, note, proposed_by) values ($1, $2, $3, $4, $5)',
    [venueId, groupId, name, note, actor.id],
  );
  // The proposer's own vote counts as a vote.
  await d.query('insert into venue_votes (venue_id, user_id) values ($1, $2) on conflict do nothing', [
    venueId,
    actor.id,
  ]);
  await postSystemMessage(groupId, `${actor.username} proposed ${name}.`);
  return getPlan(groupId);
}

export async function toggleVenueVote(
  actor: { id: string },
  groupId: string,
  venueId: string,
): Promise<Plan> {
  await requireMembership(groupId, actor.id);
  await assertPlanOpen(groupId);

  const d = await db();
  const venues = await d.query<{ id: string }>('select id from venues where id = $1 and group_id = $2', [
    venueId,
    groupId,
  ]);
  if (venues.length === 0) throw new ApiError(404, 'That venue is not in this group.', 'not_found');

  const removed = await d.query<{ venue_id: string }>(
    'delete from venue_votes where venue_id = $1 and user_id = $2 returning venue_id',
    [venueId, actor.id],
  );
  if (removed.length === 0) {
    await d.query('insert into venue_votes (venue_id, user_id) values ($1, $2)', [venueId, actor.id]);
  }
  return getPlan(groupId);
}

export async function setRsvp(actor: { id: string }, groupId: string, status: RsvpStatus): Promise<Plan> {
  await requireMembership(groupId, actor.id);
  await (await db()).query(
    `insert into rsvps (group_id, user_id, status, updated_at) values ($1, $2, $3, now())
     on conflict (group_id, user_id) do update set status = excluded.status, updated_at = now()`,
    [groupId, actor.id, status],
  );
  return getPlan(groupId);
}

export async function finalizePlan(
  actor: { id: string; username: string },
  groupId: string,
  venueId: string | null,
): Promise<Plan> {
  await requireAdmin(groupId, actor.id);
  await assertPlanOpen(groupId);
  const d = await db();

  if (venueId) {
    const venues = await d.query<{ name: string }>(
      'select name from venues where id = $1 and group_id = $2',
      [venueId, groupId],
    );
    if (venues.length === 0) throw new ApiError(404, 'That venue is not in this group.', 'not_found');
    await d.query('update plans set location_note = $2, updated_at = now() where group_id = $1', [
      groupId,
      venues[0].name,
    ]);
  }

  await d.query('update plans set finalized_at = now(), updated_at = now() where group_id = $1', [groupId]);
  await postSystemMessage(groupId, `${actor.username} locked the plan. No more changes.`);
  return getPlan(groupId);
}

export async function removeMember(
  actor: { id: string; username: string },
  groupId: string,
  targetId: string,
): Promise<Member[]> {
  await requireAdmin(groupId, actor.id);
  if (targetId === actor.id) throw new ApiError(409, 'You cannot remove yourself.', 'cannot_remove_self');

  const target = await (await db()).query<{ username: string }>('select username from users where id = $1', [targetId]);
  if (target.length === 0) throw new ApiError(404, 'That person is not in this group.', 'not_found');

  const removed = await (await db()).query<{ user_id: string }>(
    'delete from memberships where group_id = $1 and user_id = $2 returning user_id',
    [groupId, targetId],
  );
  if (removed.length === 0) throw new ApiError(404, 'That person is not in this group.', 'not_found');

  await postSystemMessage(groupId, `${target[0].username} was removed by ${actor.username}.`);
  return getMembers(groupId);
}

export async function getSnapshot(groupId: string, userId: string): Promise<GroupSnapshot> {
  const membership = await requireMembership(groupId, userId);
  const rows = await (await db()).query<{ id: string; name: string; invite_code: string }>(
    'select id, name, invite_code from groups where id = $1',
    [groupId],
  );
  const group = rows[0];
  if (!group) throw new ApiError(404, 'That group no longer exists.', 'not_found');

  const [members, messages, plan, lastSeq] = await Promise.all([
    getMembers(groupId),
    getRecentMessages(groupId),
    getPlan(groupId),
    getLastSeq(groupId),
  ]);

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    role: membership.role,
    members,
    messages,
    plan,
    lastSeq,
  };
}

export async function getSync(groupId: string, userId: string, afterSeq: number): Promise<SyncPayload> {
  const membership = await requireMembership(groupId, userId);
  const [messages, plan, members] = await Promise.all([
    getMessagesAfter(groupId, afterSeq),
    getPlan(groupId),
    getMembers(groupId),
  ]);
  // Advance only as far as this response actually delivered. Using the group's
  // maximum would silently skip messages whenever a batch is capped.
  const lastSeq = messages.length > 0 ? messages[messages.length - 1].seq : afterSeq;
  return { messages, plan, members, role: membership.role, lastSeq };
}

/** Used by the seeder for demo accounts that must never be able to sign in. */
export const LOCKED_PASSWORD_HASH = 'locked$no-login';
