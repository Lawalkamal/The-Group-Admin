import {
  CHEER_POINTS,
  computeProgress,
  findScenario,
  findScenarioAction,
  outcomeFor,
  spotlightAction,
  topCrewMember,
} from './activities';
import { db } from './db';
import { ApiError } from './http';
import { generateInviteCode, newId } from './ids';
import type { RsvpStatus } from './validate';
import type {
  ActivityState,
  ChatMessage,
  ExploreGroup,
  GroupRole,
  GroupSnapshot,
  GroupSummary,
  GroupVisibility,
  Member,
  Plan,
  Report,
  ReportReason,
  Rsvp,
  SharedGoal,
  SharedGoalContribution,
  SharedGoalCrewMember,
  SharedGoalSummary,
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

function orderCrew(crew: SharedGoalCrewMember[]): SharedGoalCrewMember[] {
  return [...crew].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.moves !== a.moves) return b.moves - a.moves;
    return a.username.localeCompare(b.username);
  });
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

/**
 * A blocked person's messages stay in the database but disappear from the
 * blocker's view, including the preview on the groups list.
 */
const BLOCK_FILTER = `
  and (m.author_id is null or not exists (
    select 1 from blocks b where b.blocker_id = $2 and b.blocked_id = m.author_id
  ))
`;

export async function getRecentMessages(
  groupId: string,
  viewerId: string,
  limit = 200,
): Promise<ChatMessage[]> {
  const rows = await (await db()).query<MessageRow>(
    `${MESSAGE_SELECT} where m.group_id = $1 ${BLOCK_FILTER}
     order by m.seq desc limit ${Math.max(1, Math.min(limit, 500))}`,
    [groupId, viewerId],
  );
  return rows.map(mapMessage).reverse();
}

export async function getMessagesAfter(
  groupId: string,
  viewerId: string,
  afterSeq: number,
  limit = 200,
): Promise<ChatMessage[]> {
  const rows = await (await db()).query<MessageRow>(
    `${MESSAGE_SELECT} where m.group_id = $1 and m.seq > $3 ${BLOCK_FILTER}
     order by m.seq asc limit ${Math.max(1, Math.min(limit, 500))}`,
    [groupId, viewerId, afterSeq],
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

export async function createGroup(
  owner: { id: string; username: string },
  name: string,
  options: { visibility?: GroupVisibility; description?: string } = {},
): Promise<GroupSnapshot> {
  const d = await db();
  let groupId = newId();
  let code = generateInviteCode();
  const visibility: GroupVisibility = options.visibility === 'discoverable' ? 'discoverable' : 'invite';
  const description = options.description ?? '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await d.query(
        `insert into groups (id, name, owner_id, invite_code, visibility, description)
         values ($1, $2, $3, $4, $5, $6)`,
        [groupId, name, owner.id, code, visibility, description],
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

/** Joining from Explore works only for groups that opted into discovery. */
export async function joinDiscoverableGroup(
  user: { id: string; username: string },
  groupId: string,
): Promise<{ groupId: string; name: string; joined: boolean }> {
  const rows = await (await db()).query<{ id: string; name: string; visibility: string }>(
    'select id, name, visibility from groups where id = $1',
    [groupId],
  );
  const group = rows[0];
  if (!group || group.visibility !== 'discoverable') {
    throw new ApiError(404, 'That community is not open to join.', 'not_found');
  }

  const inserted = await (await db()).query<{ user_id: string }>(
    `insert into memberships (group_id, user_id, role) values ($1, $2, 'member')
     on conflict (group_id, user_id) do nothing
     returning user_id`,
    [group.id, user.id],
  );

  const joined = inserted.length > 0;
  if (joined) {
    await postSystemMessage(group.id, `${user.username} joined from Explore.`);
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

export async function setGroupAccess(
  actor: { id: string; username: string },
  groupId: string,
  patch: { visibility?: GroupVisibility; description?: string },
): Promise<{ visibility: GroupVisibility; description: string }> {
  await requireAdmin(groupId, actor.id);
  const rows = await (await db()).query<{ visibility: string; description: string }>(
    'select visibility, description from groups where id = $1',
    [groupId],
  );
  const current = rows[0];
  if (!current) throw new ApiError(404, 'That group no longer exists.', 'not_found');

  const visibility: GroupVisibility =
    patch.visibility ?? (current.visibility === 'discoverable' ? 'discoverable' : 'invite');
  const description = patch.description ?? current.description;

  await (await db()).query('update groups set visibility = $2, description = $3 where id = $1', [
    groupId,
    visibility,
    description,
  ]);

  if (patch.visibility !== undefined && visibility !== current.visibility) {
    await postSystemMessage(
      groupId,
      visibility === 'discoverable'
        ? `${actor.username} made this group discoverable in Explore.`
        : `${actor.username} made this group invite-only again.`,
    );
  }

  return { visibility, description };
}

export async function listGroups(userId: string): Promise<GroupSummary[]> {
  const rows = await (await db()).query<{
    id: string;
    name: string;
    invite_code: string;
    visibility: string;
    description: string;
    role: string;
    member_count: unknown;
    last_body: string | null;
    last_at: unknown;
    event_at: unknown;
    finalized_at: unknown;
  }>(
    `select g.id, g.name, g.invite_code, g.visibility, g.description, m.role,
            (select count(*) from memberships x where x.group_id = g.id) as member_count,
            (select mm.body from messages mm
              where mm.group_id = g.id
                and (mm.author_id is null or not exists (
                  select 1 from blocks b where b.blocker_id = $1 and b.blocked_id = mm.author_id
                ))
              order by mm.seq desc limit 1) as last_body,
            (select mm.created_at from messages mm where mm.group_id = g.id order by mm.seq desc limit 1) as last_at,
            p.event_at, p.finalized_at
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
    visibility: (row.visibility === 'discoverable' ? 'discoverable' : 'invite') as GroupVisibility,
    description: row.description,
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

export async function listExploreGroups(userId: string): Promise<ExploreGroup[]> {
  const d = await db();
  const rows = await d.query<{
    id: string;
    name: string;
    description: string;
    member_count: unknown;
    last_at: unknown;
    created_at: unknown;
    activity_title: string | null;
  }>(
    `select g.id, g.name, g.description,
            (select count(*) from memberships x where x.group_id = g.id) as member_count,
            (select max(mm.created_at) from messages mm where mm.group_id = g.id) as last_at,
            g.created_at,
            (select a.title from activities a
              where a.group_id = g.id and a.status = 'active'
              order by a.created_at desc limit 1) as activity_title
       from groups g
      where g.visibility = 'discoverable'
        and not exists (
          select 1 from memberships m where m.group_id = g.id and m.user_id = $1
        )
      order by coalesce(
        (select max(mm.created_at) from messages mm where mm.group_id = g.id),
        g.created_at
      ) desc
      limit 40`,
    [userId],
  );

  const ids = rows.map((row) => row.id);
  const memberRows =
    ids.length === 0
      ? []
      : await d.query<{ group_id: string; username: string }>(
          `select m.group_id, u.username
             from memberships m
             join users u on u.id = m.user_id
            where m.group_id in (${ids.map((_, index) => `$${index + 1}`).join(', ')})
            order by case when m.role = 'admin' then 0 else 1 end, m.joined_at asc`,
          ids,
        );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    memberCount: toNum(row.member_count),
    memberNames: memberRows
      .filter((member) => member.group_id === row.id)
      .map((member) => member.username),
    lastAt: toIsoOrNull(row.last_at),
    createdAt: toIso(row.created_at),
    activityTitle: row.activity_title,
  }));
}

// ---------------------------------------------------------------------------
// Reports and blocks
// ---------------------------------------------------------------------------

type ReportRow = {
  id: string;
  group_id: string;
  reporter_id: string;
  reporter_name: string;
  target_id: string;
  target_name: string;
  reason: string;
  note: string;
  created_at: unknown;
  resolved_at: unknown;
};

const REPORT_SELECT = `
  select r.id, r.group_id, r.reporter_id, ru.username as reporter_name,
         r.target_id, tu.username as target_name, r.reason, r.note,
         r.created_at, r.resolved_at
    from reports r
    join users ru on ru.id = r.reporter_id
    join users tu on tu.id = r.target_id
`;

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    groupId: row.group_id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    targetId: row.target_id,
    targetName: row.target_name,
    reason: (['harassment', 'spam', 'hate', 'other'] as const).includes(
      row.reason as ReportReason,
    )
      ? (row.reason as ReportReason)
      : 'other',
    note: row.note,
    createdAt: toIso(row.created_at),
    resolvedAt: toIsoOrNull(row.resolved_at),
  };
}

export async function listReports(actorId: string, groupId: string): Promise<Report[]> {
  await requireAdmin(groupId, actorId);
  const rows = await (await db()).query<ReportRow>(
    `${REPORT_SELECT}
      where r.group_id = $1 and r.resolved_at is null
      order by r.created_at desc
      limit 50`,
    [groupId],
  );
  return rows.map(mapReport);
}

export async function createReport(
  actor: { id: string; username: string },
  groupId: string,
  targetId: string,
  reason: ReportReason,
  note: string,
): Promise<{ id: string }> {
  await requireMembership(groupId, actor.id);
  if (targetId === actor.id) {
    throw new ApiError(409, 'You cannot report yourself.', 'cannot_report_self');
  }

  const target = await (await db()).query<{ user_id: string }>(
    'select user_id from memberships where group_id = $1 and user_id = $2',
    [groupId, targetId],
  );
  if (target.length === 0) {
    throw new ApiError(404, 'That person is not in this group.', 'not_found');
  }

  const id = newId();
  const rows = await (await db()).query<{ id: string }>(
    `insert into reports (id, group_id, reporter_id, target_id, reason, note)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (group_id, reporter_id, target_id) do update
       set reason = excluded.reason,
           note = excluded.note,
           created_at = now(),
           resolved_at = null,
           resolved_by = null
     returning id`,
    [id, groupId, actor.id, targetId, reason, note],
  );
  return { id: rows[0]?.id ?? id };
}

export async function resolveReport(
  actor: { id: string },
  groupId: string,
  reportId: string,
): Promise<Report[]> {
  await requireAdmin(groupId, actor.id);
  const rows = await (await db()).query<{ id: string }>(
    `update reports
        set resolved_at = now(), resolved_by = $3
      where id = $1 and group_id = $2 and resolved_at is null
      returning id`,
    [reportId, groupId, actor.id],
  );
  if (rows.length === 0) throw new ApiError(404, 'That report is not open.', 'not_found');
  return listReports(actor.id, groupId);
}

export async function getBlockedIds(userId: string): Promise<string[]> {
  const rows = await (await db()).query<{ blocked_id: string }>(
    'select blocked_id from blocks where blocker_id = $1 order by created_at desc',
    [userId],
  );
  return rows.map((row) => row.blocked_id);
}

export async function toggleBlock(
  actorId: string,
  targetId: string,
): Promise<{ blocked: boolean; blockedIds: string[] }> {
  if (actorId === targetId) throw new ApiError(409, 'You cannot block yourself.', 'cannot_block_self');

  const target = await (await db()).query<{ id: string }>('select id from users where id = $1', [targetId]);
  if (target.length === 0) throw new ApiError(404, 'That person does not exist.', 'not_found');

  const d = await db();
  const removed = await d.query<{ blocked_id: string }>(
    'delete from blocks where blocker_id = $1 and blocked_id = $2 returning blocked_id',
    [actorId, targetId],
  );

  let blocked = false;
  if (removed.length === 0) {
    await d.query('insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [
      actorId,
      targetId,
    ]);
    blocked = true;
  }

  return { blocked, blockedIds: await getBlockedIds(actorId) };
}

// ---------------------------------------------------------------------------
// Party plan
// ---------------------------------------------------------------------------

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

  // Votes from people who are no longer members do not count. This also
  // repairs any rows left behind before removal cleanup existed.
  const voteRows = await d.query<{ venue_id: string; user_id: string }>(
    `select vv.venue_id, vv.user_id
       from venue_votes vv
       join venues v on v.id = vv.venue_id
      where v.group_id = $1
        and exists (
          select 1 from memberships m where m.group_id = v.group_id and m.user_id = vv.user_id
        )`,
    [groupId],
  );

  const rsvpRows = await d.query<{ user_id: string; username: string; status: string }>(
    `select r.user_id, u.username, r.status
       from rsvps r
       join users u on u.id = r.user_id
      where r.group_id = $1
        and exists (
          select 1 from memberships m where m.group_id = r.group_id and m.user_id = r.user_id
        )
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

  const target = await (await db()).query<{ username: string }>('select username from users where id = $1', [
    targetId,
  ]);
  if (target.length === 0) throw new ApiError(404, 'That person is not in this group.', 'not_found');

  const d = await db();
  const removed = await d.query<{ user_id: string }>(
    'delete from memberships where group_id = $1 and user_id = $2 returning user_id',
    [groupId, targetId],
  );
  if (removed.length === 0) throw new ApiError(404, 'That person is not in this group.', 'not_found');

  // Removal revokes current commitments (RSVP, venue votes) immediately so the
  // plan never lists someone who can no longer attend. Past messages and shared
  // goal contributions stay as history.
  await d.query('delete from rsvps where group_id = $1 and user_id = $2', [groupId, targetId]);
  await d.query(
    `delete from venue_votes
      where user_id = $1
        and venue_id in (select id from venues where group_id = $2)`,
    [targetId, groupId],
  );

  await postSystemMessage(groupId, `${target[0].username} was removed by ${actor.username}.`);
  return getMembers(groupId);
}

// ---------------------------------------------------------------------------
// Shared goal activity
// ---------------------------------------------------------------------------

type ActivityRow = {
  id: string;
  group_id: string;
  scenario: string;
  title: string;
  goal: unknown;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: unknown;
  completed_at: unknown;
  final_progress: unknown;
  outcome: string;
};

const ACTIVITY_SELECT = `
  select a.id, a.group_id, a.scenario, a.title, a.goal, a.status, a.created_by,
         u.username as created_by_name, a.created_at, a.completed_at,
         a.final_progress, a.outcome
    from activities a
    left join users u on u.id = a.created_by
`;

type ContributionRow = {
  id: string;
  user_id: string;
  username: string;
  action_id: string;
  points: unknown;
  note: string;
  created_at: unknown;
};

type CheerRow = { user_id: string; username: string; action_id: string };

async function buildActiveActivity(row: ActivityRow): Promise<SharedGoal> {
  const d = await db();
  const [contributionRows, cheerRows, members] = await Promise.all([
    d.query<ContributionRow>(
      `select c.id, c.user_id, u.username, c.action_id, c.points, c.note, c.created_at
         from activity_contributions c
         join users u on u.id = c.user_id
        where c.activity_id = $1
        order by c.created_at asc`,
      [row.id],
    ),
    d.query<CheerRow>(
      `select ch.user_id, u.username, ch.action_id
         from activity_cheers ch
         join users u on u.id = ch.user_id
        where ch.activity_id = $1
        order by ch.created_at asc`,
      [row.id],
    ),
    getMembers(row.group_id),
  ]);

  const scenario = findScenario(row.scenario);
  const actions = scenario?.actions ?? [];

  const contributions: SharedGoalContribution[] = contributionRows.map((contribution) => ({
    id: contribution.id,
    userId: contribution.user_id,
    username: contribution.username,
    actionId: contribution.action_id,
    actionLabel:
      actions.find((action) => action.id === contribution.action_id)?.label ?? contribution.action_id,
    points: toNum(contribution.points),
    note: contribution.note,
    createdAt: toIso(contribution.created_at),
  }));

  const cheers = cheerRows.map((cheer) => ({
    userId: cheer.user_id,
    username: cheer.username,
    actionId: cheer.action_id,
  }));

  const crew = new Map<string, SharedGoalCrewMember>();
  for (const member of members) {
    crew.set(member.id, {
      userId: member.id,
      username: member.username,
      points: 0,
      moves: 0,
      cheerActionId: null,
      isMember: true,
    });
  }

  const ensureCrew = (userId: string, username: string): SharedGoalCrewMember => {
    const existing = crew.get(userId);
    if (existing) return existing;
    const entry: SharedGoalCrewMember = {
      userId,
      username,
      points: 0,
      moves: 0,
      cheerActionId: null,
      isMember: members.some((member) => member.id === userId),
    };
    crew.set(userId, entry);
    return entry;
  };

  for (const contribution of contributions) {
    const entry = ensureCrew(contribution.userId, contribution.username);
    entry.points += contribution.points;
    entry.moves += 1;
  }

  for (const cheer of cheers) {
    const entry = ensureCrew(cheer.userId, cheer.username);
    entry.cheerActionId = cheer.actionId;
    entry.points += CHEER_POINTS;
  }

  return {
    id: row.id,
    scenario: row.scenario,
    title: row.title,
    blurb: scenario?.blurb ?? 'A shared goal for the group.',
    goal: toNum(row.goal),
    status: 'active',
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdAt: toIso(row.created_at),
    progress: computeProgress(contributions, cheers.length),
    actions,
    contributions,
    cheers,
    crew: orderCrew([...crew.values()]),
    spotlightActionId: spotlightAction(scenario, cheers),
  };
}

async function getActiveActivity(groupId: string): Promise<SharedGoal | null> {
  const rows = await (await db()).query<ActivityRow>(
    `${ACTIVITY_SELECT}
      where a.group_id = $1 and a.status = 'active'
      order by a.created_at desc
      limit 1`,
    [groupId],
  );
  return rows[0] ? buildActiveActivity(rows[0]) : null;
}

async function getActivityHistory(groupId: string): Promise<SharedGoalSummary[]> {
  const rows = await (await db()).query<{
    id: string;
    scenario: string;
    title: string;
    goal: unknown;
    status: string;
    created_at: unknown;
    completed_at: unknown;
    final_progress: unknown;
    outcome: string;
    participants: unknown;
  }>(
    `select a.id, a.scenario, a.title, a.goal, a.status, a.created_at, a.completed_at,
            a.final_progress, a.outcome,
            (select count(*) from (
              select c.user_id from activity_contributions c where c.activity_id = a.id
              union
              select ch.user_id from activity_cheers ch where ch.activity_id = a.id
            ) people) as participants
       from activities a
      where a.group_id = $1 and a.status <> 'active'
      order by a.completed_at desc nulls last, a.created_at desc
      limit 8`,
    [groupId],
  );
  return rows.map((row) => ({
    id: row.id,
    scenario: row.scenario,
    title: row.title,
    goal: toNum(row.goal),
    status: row.status === 'closed' ? 'closed' : 'complete',
    createdAt: toIso(row.created_at),
    completedAt: toIsoOrNull(row.completed_at),
    finalProgress: toNum(row.final_progress),
    outcome: row.outcome,
    participants: toNum(row.participants),
  }));
}

export async function getActivityState(groupId: string): Promise<ActivityState> {
  const [current, history] = await Promise.all([getActiveActivity(groupId), getActivityHistory(groupId)]);
  return { current, history };
}

async function completeGoalIfReached(row: ActivityRow): Promise<void> {
  const current = await buildActiveActivity(row);
  if (current.progress < current.goal) return;

  const scenario = findScenario(row.scenario);
  const top = topCrewMember(current.crew);
  const outcome = scenario ? outcomeFor(scenario, top) : `The group reached ${current.progress} points.`;

  const updated = await (await db()).query<{ id: string }>(
    `update activities
        set status = 'complete', completed_at = now(), final_progress = $2, outcome = $3
      where id = $1 and status = 'active'
      returning id`,
    [row.id, current.progress, outcome],
  );

  if (updated.length > 0) {
    await postSystemMessage(row.group_id, `Goal reached — ${outcome}`);
  }
}

export async function startActivity(
  actor: { id: string; username: string },
  groupId: string,
  scenarioId: string,
  goal: number,
): Promise<ActivityState> {
  await requireMembership(groupId, actor.id);
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new ApiError(400, 'Pick one of the available stories.', 'invalid_scenario');

  const existing = await (await db()).query<{ id: string }>(
    "select id from activities where group_id = $1 and status = 'active' limit 1",
    [groupId],
  );
  if (existing.length > 0) {
    throw new ApiError(409, 'A shared goal is already running.', 'activity_active');
  }

  const id = newId();
  try {
    await (await db()).query(
      `insert into activities (id, group_id, kind, scenario, title, goal, status, created_by)
       values ($1, $2, 'shared_goal', $3, $4, $5, 'active', $6)`,
      [id, groupId, scenario.id, scenario.title, goal, actor.id],
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(409, 'A shared goal is already running.', 'activity_active');
    }
    throw error;
  }

  await postSystemMessage(
    groupId,
    `${actor.username} started a shared goal: ${scenario.title} (${goal} points).`,
  );
  return getActivityState(groupId);
}

export async function contributeToActivity(
  actor: { id: string; username: string },
  groupId: string,
  actionId: string,
  note: string,
): Promise<ActivityState> {
  await requireMembership(groupId, actor.id);

  const rows = await (await db()).query<ActivityRow>(
    `${ACTIVITY_SELECT}
      where a.group_id = $1 and a.status = 'active'
      order by a.created_at desc limit 1`,
    [groupId],
  );
  const activity = rows[0];
  if (!activity) throw new ApiError(409, 'There is no shared goal running.', 'no_activity');

  const action = findScenarioAction(activity.scenario, actionId);
  if (!action) throw new ApiError(400, 'That action is not part of this story.', 'invalid_action');

  const contributionId = newId();
  const inserted = await (await db()).query<{ id: string }>(
    `insert into activity_contributions (id, activity_id, user_id, action_id, points, note)
     select $1, a.id, $2, $3, $4, $5
       from activities a
      where a.id = $6 and a.status = 'active'
     on conflict (activity_id, user_id, action_id) do nothing
     returning id`,
    [contributionId, actor.id, action.id, action.points, note, activity.id],
  );

  if (inserted.length === 0) {
    throw new ApiError(409, 'You already did that, or the goal has ended.', 'contribution_rejected');
  }

  await completeGoalIfReached(activity);
  return getActivityState(groupId);
}

export async function cheerActivity(
  actor: { id: string; username: string },
  groupId: string,
  actionId: string,
): Promise<ActivityState> {
  await requireMembership(groupId, actor.id);

  const rows = await (await db()).query<ActivityRow>(
    `${ACTIVITY_SELECT}
      where a.group_id = $1 and a.status = 'active'
      order by a.created_at desc limit 1`,
    [groupId],
  );
  const activity = rows[0];
  if (!activity) throw new ApiError(409, 'There is no shared goal running.', 'no_activity');

  const action = findScenarioAction(activity.scenario, actionId);
  if (!action) throw new ApiError(400, 'That action is not part of this story.', 'invalid_action');

  const d = await db();
  const existing = await d.query<{ action_id: string }>(
    'select action_id from activity_cheers where activity_id = $1 and user_id = $2',
    [activity.id, actor.id],
  );

  if (existing[0]?.action_id === action.id) {
    await d.query('delete from activity_cheers where activity_id = $1 and user_id = $2', [
      activity.id,
      actor.id,
    ]);
  } else {
    await d.query(
      `insert into activity_cheers (activity_id, user_id, action_id)
       select a.id, $2, $3 from activities a where a.id = $1 and a.status = 'active'
       on conflict (activity_id, user_id) do update
         set action_id = excluded.action_id, created_at = now()`,
      [activity.id, actor.id, action.id],
    );
  }

  await completeGoalIfReached(activity);
  return getActivityState(groupId);
}

export async function closeActivity(
  actor: { id: string; username: string },
  groupId: string,
): Promise<ActivityState> {
  const membership = await requireMembership(groupId, actor.id);
  const rows = await (await db()).query<ActivityRow>(
    `${ACTIVITY_SELECT}
      where a.group_id = $1 and a.status = 'active'
      order by a.created_at desc limit 1`,
    [groupId],
  );
  const activity = rows[0];
  if (!activity) throw new ApiError(409, 'There is no shared goal running.', 'no_activity');

  if (membership.role !== 'admin' && activity.created_by !== actor.id) {
    throw new ApiError(403, 'Only the admin or the person who started it can close this goal.', 'forbidden');
  }

  const current = await buildActiveActivity(activity);
  const outcome = `Closed early at ${current.progress} of ${current.goal} points.`;

  const updated = await (await db()).query<{ id: string }>(
    `update activities
        set status = 'closed', completed_at = now(), final_progress = $2, outcome = $3
      where id = $1 and status = 'active'
      returning id`,
    [activity.id, current.progress, outcome],
  );

  if (updated.length > 0) {
    await postSystemMessage(
      groupId,
      `${actor.username} closed the shared goal at ${current.progress} of ${current.goal} points.`,
    );
  }
  return getActivityState(groupId);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function getSnapshot(groupId: string, userId: string): Promise<GroupSnapshot> {
  const membership = await requireMembership(groupId, userId);
  const rows = await (await db()).query<{
    id: string;
    name: string;
    invite_code: string;
    visibility: string;
    description: string;
  }>('select id, name, invite_code, visibility, description from groups where id = $1', [groupId]);
  const group = rows[0];
  if (!group) throw new ApiError(404, 'That group no longer exists.', 'not_found');

  const [members, messages, plan, lastSeq, activity, blockedIds] = await Promise.all([
    getMembers(groupId),
    getRecentMessages(groupId, userId),
    getPlan(groupId),
    getLastSeq(groupId),
    getActiveActivity(groupId),
    getBlockedIds(userId),
  ]);

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    visibility: group.visibility === 'discoverable' ? 'discoverable' : 'invite',
    description: group.description,
    role: membership.role,
    members,
    messages,
    plan,
    activity,
    blockedIds,
    lastSeq,
  };
}

export async function getSync(
  groupId: string,
  userId: string,
  afterSeq: number,
): Promise<SyncPayload> {
  const membership = await requireMembership(groupId, userId);
  const [messages, plan, members, activity, blockedIds] = await Promise.all([
    getMessagesAfter(groupId, userId, afterSeq),
    getPlan(groupId),
    getMembers(groupId),
    getActiveActivity(groupId),
    getBlockedIds(userId),
  ]);
  // Advance only as far as this response actually delivered. Using the group's
  // maximum would silently skip messages whenever a batch is capped.
  const lastSeq = messages.length > 0 ? messages[messages.length - 1].seq : afterSeq;
  return { messages, plan, members, activity, blockedIds, role: membership.role, lastSeq };
}

/** Used by the seeder for demo accounts that must never be able to sign in. */
export const LOCKED_PASSWORD_HASH = 'locked$no-login';
