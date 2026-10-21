#!/usr/bin/env node
/**
 * End-to-end acceptance check for the invite-only group MVP.
 *
 * Proves the milestone's key requirement against a running server:
 * two separate accounts join the same group, see each other's messages,
 * and collaborate on one party plan — while a third non-member cannot.
 *
 *   npm run dev            # in another terminal
 *   npm run test:e2e
 *
 * Env: E2E_BASE (default http://127.0.0.1:3100)
 */

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000';
const run = Date.now().toString(36).slice(-6);

let failures = 0;
let checks = 0;

function pass(label, detail = '') {
  checks += 1;
  console.log(`  \x1b[32mPASS\x1b[0m ${label}${detail ? ` \x1b[2m(${detail})\x1b[0m` : ''}`);
}

function fail(label, detail) {
  checks += 1;
  failures += 1;
  console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` \x1b[2m— ${detail}\x1b[0m` : ''}`);
}

function check(condition, label, detail = '') {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

/** Minimal cookie jar: one per simulated person. */
function makeClient(name) {
  const jar = new Map();
  return {
    name,
    async call(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (jar.size > 0) {
        headers.cookie = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
      }
      if (options.body !== undefined) headers['content-type'] = 'application/json';

      const response = await fetch(`${BASE}${path}`, {
        method: options.method || (options.body === undefined ? 'GET' : 'POST'),
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: 'manual',
      });

      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const index = pair.indexOf('=');
        const key = pair.slice(0, index);
        const value = pair.slice(index + 1);
        if (value === '') jar.delete(key);
        else jar.set(key, value);
      }

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text.slice(0, 120) };
      }
      return { status: response.status, data };
    },
  };
}

async function register(client, username, password) {
  return client.call('/api/auth/register', { body: { username, password } });
}

async function main() {
  console.log(`\nThe Group Admin — two-account acceptance check\n  server: ${BASE}\n`);

  const alive = await fetch(`${BASE}/login`).then(
    (response) => response.ok,
    () => false,
  );
  if (!alive) {
    console.log(`  \x1b[31mFAIL\x1b[0m server is not reachable at ${BASE}. Run "npm run dev" first.`);
    process.exit(1);
  }

  const alice = makeClient('Alice');
  const bob = makeClient('Bob');
  const outsider = makeClient('Outsider');

  const aliceName = `alice_${run}`;
  const bobName = `bob_${run}`;
  const outsiderName = `outsider_${run}`;
  const password = `pass-${run}-word`;

  // 1. Sign up
  const aReg = await register(alice, aliceName, password);
  check(aReg.status === 201, 'Alice creates an account', `status ${aReg.status}`);

  // The demo group is claimed once per database. On a second run the account
  // starts empty, so create a group and keep testing the same flow.
  let groupId = aReg.data?.groupId;
  const seeded = Boolean(groupId);
  if (seeded) {
    pass('Alice lands in the seeded demo group', groupId);
  } else {
    console.log('  \x1b[33mSKIP\x1b[0m seeded demo group already claimed in this database');
    const created = await alice.call('/api/groups', { body: { name: `E2E run ${run}` } });
    groupId = created.data?.groupId;
    check(created.status === 201 && Boolean(groupId), 'Alice creates a fresh group instead');
  }

  // 2. The group has content and an invite code
  const snapshot = await alice.call(`/api/groups/${groupId}`);
  check(snapshot.status === 200, 'Alice can read her own group', `status ${snapshot.status}`);
  const group = snapshot.data?.group;
  if (seeded) {
    check(group?.members?.length >= 6, 'Seeded group has the committee in it', `${group?.members?.length} members`);
    check((group?.messages?.length ?? 0) >= 8, 'Seeded group has chat history', `${group?.messages?.length} messages`);
    check((group?.plan?.venues?.length ?? 0) === 3, 'Seeded group has a party plan with venues');
  }
  check(group?.role === 'admin', 'Alice is the admin of the group');
  const inviteCode = group?.inviteCode;
  check(typeof inviteCode === 'string' && inviteCode.length === 8, 'Invite code is eight characters', inviteCode);

  // 3. Second account, clean slate
  const bReg = await register(bob, bobName, password);
  check(bReg.status === 201, 'Bob creates a separate account', `status ${bReg.status}`);
  check(bReg.data?.groupId == null, 'Bob starts with an empty state, not someone else’s group');

  // 4. Join by code
  const join = await bob.call('/api/groups/join', { body: { code: inviteCode } });
  check(join.status === 200 && join.data?.joined === true, 'Bob joins Alice’s group with the code', `status ${join.status}`);

  const bobSide = await bob.call(`/api/groups/${groupId}`);
  check(bobSide.status === 200, 'Bob can read the same group');
  check(
    bobSide.data?.group?.members?.some((member) => member.username === bobName),
    'Bob appears in the member list',
  );

  // 5. Chat both ways
  const aliceMessage = `Alice here, can everyone see this? ${run}`;
  const sent = await alice.call(`/api/groups/${groupId}/messages`, { body: { body: aliceMessage } });
  check(sent.status === 201, 'Alice sends a message', `status ${sent.status}`);

  const bobSync = await bob.call(`/api/groups/${groupId}/sync?after=0`);
  const bobSees = (bobSync.data?.messages ?? []).some((message) => message.body === aliceMessage);
  check(bobSees, 'Bob receives Alice’s message by polling');

  const bobMessage = `Bob replying, loud and clear ${run}`;
  await bob.call(`/api/groups/${groupId}/messages`, { body: { body: bobMessage } });
  const afterSeq = bobSync.data?.lastSeq ?? 0;
  const aliceSync = await alice.call(`/api/groups/${groupId}/sync?after=${afterSeq}`);
  const aliceSees = (aliceSync.data?.messages ?? []).some((message) => message.body === bobMessage);
  check(aliceSees, 'Alice receives Bob’s reply by polling');

  // Cursor safety: a poll from an older position still returns everything after it.
  const cursor = (await bob.call(`/api/groups/${groupId}/sync?after=0`)).data?.lastSeq ?? 0;
  await alice.call(`/api/groups/${groupId}/messages`, { body: { body: `gap one ${run}` } });
  await alice.call(`/api/groups/${groupId}/messages`, { body: { body: `gap two ${run}` } });
  await bob.call(`/api/groups/${groupId}/messages`, { body: { body: `bob jumps in ${run}` } });
  const gapSync = await bob.call(`/api/groups/${groupId}/sync?after=${cursor}`);
  const gapBodies = (gapSync.data?.messages ?? []).map((message) => message.body);
  check(
    gapBodies.includes(`gap one ${run}`) && gapBodies.includes(`gap two ${run}`),
    'Polling from an older cursor returns every newer message in order',
    `${gapBodies.length} returned`,
  );
  check(
    gapSync.data?.lastSeq === (gapSync.data?.messages ?? []).at(-1)?.seq,
    'The cursor advances only to the last message delivered',
  );

  // A brand-new group contains only system events, which is what makes the
  // "you're in" welcome state reachable.
  const freshGroup = await alice.call('/api/groups', { body: { name: `Fresh ${run}` } });
  const freshSnapshot = await alice.call(`/api/groups/${freshGroup.data?.groupId}`);
  const freshMessages = freshSnapshot.data?.group?.messages ?? [];
  check(
    freshMessages.length > 0 && freshMessages.every((message) => message.kind === 'system'),
    'A new group starts with system events only (empty-state path)',
    `${freshMessages.length} messages`,
  );

  // 6. Party plan collaboration
  const venueResponse = await bob.call(`/api/groups/${groupId}/plan/venues`, {
    body: { name: `Bob's Rooftop ${run}`, note: 'Cheap, loud, available' },
  });
  check(venueResponse.status === 201, 'Bob (a member) can propose a venue', `status ${venueResponse.status}`);
  const venue = (venueResponse.data?.plan?.venues ?? []).find((item) => item.name.includes(run));
  check(Boolean(venue), 'The new venue is on the shared plan');

  const vote = await alice.call(`/api/groups/${groupId}/plan/votes`, { body: { venueId: venue?.id } });
  const votedVenue = (vote.data?.plan?.venues ?? []).find((item) => item.id === venue?.id);
  check(votedVenue?.voters?.length === 2, 'Alice’s vote stacks on Bob’s', `${votedVenue?.voters?.length} votes`);

  const rsvp = await bob.call(`/api/groups/${groupId}/plan/rsvp`, { body: { status: 'yes' } });
  const bobRsvp = (rsvp.data?.plan?.rsvps ?? []).find((item) => item.username === bobName);
  check(bobRsvp?.status === 'yes', 'Bob RSVPs yes to the shared plan');

  // 7. Authorisation boundaries
  const bobLock = await bob.call(`/api/groups/${groupId}/plan/finalize`, { body: {} });
  check(bobLock.status === 403, 'A non-admin cannot lock the plan', `status ${bobLock.status}`);

  const lock = await alice.call(`/api/groups/${groupId}/plan/finalize`, { body: { venueId: venue?.id } });
  check(Boolean(lock.data?.plan?.finalizedAt), 'The admin locks the plan', `status ${lock.status}`);

  const venueAfterLock = await bob.call(`/api/groups/${groupId}/plan/venues`, { body: { name: 'Too late hall' } });
  check(venueAfterLock.status === 409, 'Locked plan rejects new venues', `status ${venueAfterLock.status}`);

  // 8. Isolation
  const oReg = await register(outsider, outsiderName, password);
  check(oReg.status === 201, 'A third account registers');
  oReg.data?.groupId && (await outsider.call(`/api/groups/${oReg.data.groupId}`));

  const leak = await outsider.call(`/api/groups/${groupId}/sync?after=0`);
  check(leak.status === 404, 'Non-members cannot read the group’s messages', `status ${leak.status}`);
  const leakPage = await outsider.call(`/api/groups/${groupId}`);
  check(leakPage.status === 404, 'Non-members cannot read the group record', `status ${leakPage.status}`);

  const postLeak = await outsider.call(`/api/groups/${groupId}/messages`, { body: { body: 'let me in' } });
  check(postLeak.status === 404, 'Non-members cannot post to the group', `status ${postLeak.status}`);

  const anonymous = await fetch(`${BASE}/api/groups/${groupId}/sync?after=0`);
  check(anonymous.status === 401, 'Signed-out requests are rejected', `status ${anonymous.status}`);

  // 9. Removal revokes access immediately
  const members = (await alice.call(`/api/groups/${groupId}`)).data?.group?.members ?? [];
  const bobId = members.find((member) => member.username === bobName)?.id;
  const remove = await alice.call(`/api/groups/${groupId}/members/${bobId}`, { method: 'DELETE' });
  check(remove.status === 200, 'Admin removes Bob', `status ${remove.status}`);
  const bobAfterRemoval = await bob.call(`/api/groups/${groupId}/sync?after=0`);
  check(bobAfterRemoval.status === 404, 'Removed member loses access at once', `status ${bobAfterRemoval.status}`);

  // 10. Rotation invalidates the old code
  const rotated = await alice.call(`/api/groups/${groupId}/invite`, { method: 'POST' });
  const newCode = rotated.data?.inviteCode;
  check(Boolean(newCode) && newCode !== inviteCode, 'Rotating the code issues a new one', `${inviteCode} → ${newCode}`);
  const staleJoin = await outsider.call('/api/groups/join', { body: { code: inviteCode } });
  check(staleJoin.status === 404, 'The old code no longer works', `status ${staleJoin.status}`);

  console.log(`\n  ${checks - failures}/${checks} checks passed\n`);
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n  E2E run crashed:', error);
  process.exit(1);
});
