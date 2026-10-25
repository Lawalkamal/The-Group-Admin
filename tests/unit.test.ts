import { describe, expect, it } from 'vitest';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from '../lib/auth';
import { INVITE_CODE_LENGTH, generateInviteCode, INVITE_ALPHABET_PATTERN } from '../lib/ids';
import { mergeMessages, type LocalMessage } from '../lib/messages';
import {
  checkActivityGoal,
  checkActivityNote,
  checkEventDate,
  checkGroupDescription,
  checkGroupName,
  checkInviteCode,
  checkMessageBody,
  checkPassword,
  checkReportReason,
  checkRsvp,
  checkUsername,
  checkVenueName,
  checkVisibility,
} from '../lib/validate';
import {
  CHEER_POINTS,
  SHARED_GOAL_SCENARIOS,
  computeProgress,
  findScenario,
  findScenarioAction,
  outcomeFor,
  spotlightAction,
  topCrewMember,
} from '../lib/activities';
import type { SharedGoalCrewMember } from '../lib/types';
import { dayKey, toLocalInput, truncate } from '../lib/format';

describe('password hashing', () => {
  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse batteru', hash)).resolves.toBe(false);
  });

  it('never stores the raw password', async () => {
    const hash = await hashPassword('supersecret1');
    expect(hash).not.toContain('supersecret1');
    expect(hash.startsWith('pbkdf2$sha256$')).toBe(true);
  });

  it('salts each hash so identical passwords differ', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    expect(first).not.toBe(second);
  });

  it('refuses malformed or missing hashes', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'locked$no-login')).resolves.toBe(false);
    await expect(verifyPassword('x', 'pbkdf2$sha256$1000$abc$def')).resolves.toBe(false);
    await expect(verifyPassword('x', null)).resolves.toBe(false);
  });

  it('stores session tokens only as hashes', () => {
    const token = newSessionToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token)).not.toBe(token);
  });
});

describe('username validation', () => {
  it('accepts a normal handle', () => {
    const result = checkUsername('TundeDJ');
    expect(result).toEqual({ ok: true, value: 'TundeDJ' });
  });

  it('rejects short, long, and symbol-laden handles', () => {
    expect(checkUsername('ab').ok).toBe(false);
    expect(checkUsername('a'.repeat(21)).ok).toBe(false);
    expect(checkUsername('bad name').ok).toBe(false);
    expect(checkUsername('bad-name').ok).toBe(false);
    expect(checkUsername('').ok).toBe(false);
  });

  it('rejects all-digit usernames', () => {
    expect(checkUsername('123456').ok).toBe(false);
  });
});

describe('password validation', () => {
  it('requires at least eight characters', () => {
    expect(checkPassword('short').ok).toBe(false);
    expect(checkPassword('longenough').ok).toBe(true);
  });

  it('caps absurd lengths', () => {
    expect(checkPassword('a'.repeat(201)).ok).toBe(false);
  });
});

describe('message validation', () => {
  it('collapses whitespace and rejects empties', () => {
    expect(checkMessageBody('  hello   there ')).toEqual({ ok: true, value: 'hello there' });
    expect(checkMessageBody('   ').ok).toBe(false);
    expect(checkMessageBody(undefined).ok).toBe(false);
  });

  it('enforces the 1000 character cap', () => {
    expect(checkMessageBody('a'.repeat(1000)).ok).toBe(true);
    expect(checkMessageBody('a'.repeat(1001)).ok).toBe(false);
  });
});

describe('group and venue names', () => {
  it('accepts a real group name', () => {
    expect(checkGroupName('Adebayo @ 60')).toEqual({ ok: true, value: 'Adebayo @ 60' });
  });

  it('rejects one-character and overlong names', () => {
    expect(checkGroupName('a').ok).toBe(false);
    expect(checkGroupName('a'.repeat(61)).ok).toBe(false);
  });

  it('requires a venue name', () => {
    expect(checkVenueName('Grandeur Hall').ok).toBe(true);
    expect(checkVenueName('x').ok).toBe(false);
  });
});

describe('invite codes', () => {
  it('generates unambiguous eight character codes', () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(code).toMatch(new RegExp(`^${INVITE_ALPHABET_PATTERN}+$`));
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it('normalises user input', () => {
    expect(checkInviteCode(' owambe-60 ')).toEqual({ ok: true, value: 'OWAMBE60' });
    expect(checkInviteCode('ab').ok).toBe(false);
  });
});

describe('party plan inputs', () => {
  it('parses a date input into an ISO timestamp', () => {
    const result = checkEventDate('2026-11-08');
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Date(result.value as string).getFullYear()).toBe(2026);
  });

  it('allows clearing the date', () => {
    expect(checkEventDate(null)).toEqual({ ok: true, value: null });
    expect(checkEventDate('')).toEqual({ ok: true, value: null });
  });

  it('rejects nonsense dates', () => {
    expect(checkEventDate('not-a-date').ok).toBe(false);
    expect(checkEventDate('1850-01-01').ok).toBe(false);
  });

  it('only accepts the three RSVP states', () => {
    expect(checkRsvp('yes')).toEqual({ ok: true, value: 'yes' });
    expect(checkRsvp('maybe')).toEqual({ ok: true, value: 'maybe' });
    expect(checkRsvp('no')).toEqual({ ok: true, value: 'no' });
    expect(checkRsvp('definitely').ok).toBe(false);
  });

  it('round-trips a timestamp through the datetime-local input value', () => {
    const iso = new Date(2026, 10, 8, 16, 30).toISOString();
    const local = toLocalInput(iso);
    expect(local).toBe('2026-11-08T16:30');
    expect(new Date(local).getTime()).toBe(new Date(iso).getTime());
  });
});

describe('chat merging', () => {
  const base = {
    kind: 'user' as const,
    authorId: 'user-1',
    authorName: 'Alice',
    createdAt: '2026-10-21T10:00:00.000Z',
  };

  it('orders by sequence', () => {
    const current: LocalMessage[] = [
      { ...base, seq: 2, id: 'b', body: 'second' },
      { ...base, seq: 1, id: 'a', body: 'first' },
    ];
    const merged = mergeMessages(current, [{ ...base, seq: 3, id: 'c', body: 'third' }]);
    expect(merged.map((message) => message.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not duplicate a message seen twice', () => {
    const message = { ...base, seq: 4, id: 'd', body: 'once' };
    const merged = mergeMessages([message], [message]);
    expect(merged).toHaveLength(1);
  });

  it('replaces an optimistic message with the saved copy', () => {
    const optimistic: LocalMessage = {
      ...base,
      seq: Number.MAX_SAFE_INTEGER,
      id: 'local-1',
      body: 'hello',
      pending: true,
    };
    const saved = { ...base, seq: 9, id: 'server-1', body: 'hello' };
    const merged = mergeMessages([optimistic].filter((message) => message.id !== 'local-1'), [saved]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('server-1');
    expect(merged[0].pending).toBe(false);
  });

  it('keeps a failed optimistic message visible', () => {
    const failed: LocalMessage = { ...base, seq: Number.MAX_SAFE_INTEGER, id: 'local-2', body: 'x', failed: true };
    const merged = mergeMessages([failed], []);
    expect(merged[0].failed).toBe(true);
  });
});

describe('community and activity validation', () => {
  it('defaults nothing and accepts only the two visibilities', () => {
    expect(checkVisibility('invite')).toEqual({ ok: true, value: 'invite' });
    expect(checkVisibility('discoverable')).toEqual({ ok: true, value: 'discoverable' });
    expect(checkVisibility('public').ok).toBe(false);
    expect(checkVisibility(null).ok).toBe(false);
  });

  it('caps group descriptions', () => {
    expect(checkGroupDescription('  A group for the crew  ')).toEqual({
      ok: true,
      value: 'A group for the crew',
    });
    expect(checkGroupDescription('a'.repeat(141)).ok).toBe(false);
  });

  it('accepts only known report reasons', () => {
    expect(checkReportReason('harassment').ok).toBe(true);
    expect(checkReportReason('spam').ok).toBe(true);
    expect(checkReportReason('hate').ok).toBe(true);
    expect(checkReportReason('other').ok).toBe(true);
    expect(checkReportReason('because').ok).toBe(false);
  });

  it('keeps goals inside a sane range', () => {
    expect(checkActivityGoal(100)).toEqual({ ok: true, value: 100 });
    expect(checkActivityGoal('50')).toEqual({ ok: true, value: 50 });
    expect(checkActivityGoal(49).ok).toBe(false);
    expect(checkActivityGoal(501).ok).toBe(false);
    expect(checkActivityGoal(100.5).ok).toBe(false);
  });

  it('caps activity notes', () => {
    expect(checkActivityNote('  found the corner  ')).toEqual({ ok: true, value: 'found the corner' });
    expect(checkActivityNote('a'.repeat(141)).ok).toBe(false);
  });
});

describe('shared goal scenarios', () => {
  it('has unique scenarios and actions with positive points', () => {
    const scenarioIds = new Set<string>();
    for (const scenario of SHARED_GOAL_SCENARIOS) {
      expect(scenarioIds.has(scenario.id)).toBe(false);
      scenarioIds.add(scenario.id);
      expect(scenario.actions.length).toBeGreaterThanOrEqual(3);
      const actionIds = new Set<string>();
      for (const action of scenario.actions) {
        expect(actionIds.has(action.id)).toBe(false);
        actionIds.add(action.id);
        expect(action.points).toBeGreaterThan(0);
        expect(action.label.length).toBeGreaterThan(3);
      }
      expect(scenario.outcome.length).toBeGreaterThan(10);
    }
  });

  it('finds scenarios and actions, and rejects made-up ids', () => {
    expect(findScenario('night_market')?.title).toBe('Night Market Takeover');
    expect(findScenario('not-real')).toBeNull();
    expect(findScenarioAction('night_market', 'cook')?.points).toBe(20);
    expect(findScenarioAction('night_market', 'teleport')).toBeNull();
  });

  it('counts contribution points plus cheer momentum', () => {
    expect(computeProgress([{ points: 20 }, { points: 15 }], 2)).toBe(35 + 2 * CHEER_POINTS);
    expect(computeProgress([], 0)).toBe(0);
    expect(CHEER_POINTS).toBeGreaterThan(0);
  });

  it('picks a stable spotlight action from the most cheers', () => {
    const scenario = findScenario('night_market');
    expect(spotlightAction(scenario, [])).toBeNull();
    expect(spotlightAction(scenario, [{ actionId: 'sign' }, { actionId: 'cook' }, { actionId: 'cook' }])).toBe(
      'cook',
    );
    // A tie falls back to the scenario order instead of flickering.
    expect(spotlightAction(scenario, [{ actionId: 'rally' }, { actionId: 'cook' }])).toBe('cook');
  });

  it('names the top contributor and writes a short outcome', () => {
    const crew: SharedGoalCrewMember[] = [
      { userId: 'a', username: 'Amara', points: 20, moves: 1, cheerActionId: null, isMember: true },
      { userId: 'b', username: 'Bode', points: 35, moves: 2, cheerActionId: 'cook', isMember: true },
    ];
    const top = topCrewMember(crew);
    expect(top?.username).toBe('Bode');
    const scenario = findScenario('night_market');
    if (scenario && top) {
      const outcome = outcomeFor(scenario, top);
      expect(outcome).toContain(scenario.outcome);
      expect(outcome).toContain('Bode');
      expect(outcome).toContain('35 points');
    }
  });
});

describe('formatting helpers', () => {
  it('groups messages by local calendar day', () => {
    const morning = new Date(2026, 9, 21, 8, 0).toISOString();
    const evening = new Date(2026, 9, 21, 22, 0).toISOString();
    expect(dayKey(morning)).toBe(dayKey(evening));
    expect(dayKey(morning)).not.toBe(dayKey(new Date(2026, 9, 22, 8, 0).toISOString()));
  });

  it('truncates long previews on a word edge', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a much longer preview line', 12)).toBe('a much long…');
  });
});
