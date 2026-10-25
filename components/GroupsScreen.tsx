'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, AvatarStack } from './Avatar';
import { ArrowRight, Compass, Plus, Users } from './icons';
import type { GroupSummary, GroupVisibility } from '@/lib/types';
import { formatEventChip } from '@/lib/format';

type Props = {
  user: { id: string; username: string };
  initialGroups: GroupSummary[];
};

type Panel = 'create' | 'join' | null;

export function GroupsScreen({ user, initialGroups }: Props) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [panel, setPanel] = useState<Panel>(initialGroups.length === 0 ? 'create' : null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('invite');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The server render can be stale after a code rotation or a join in another
  // tab. Refreshing here keeps every card's invite code tied to its own group.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/groups', { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { groups?: GroupSummary[] };
        if (alive && Array.isArray(data.groups)) setGroups(data.groups);
      } catch {
        // Keep the server-rendered list; the next navigation will retry.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          visibility,
          description: visibility === 'discoverable' ? description : '',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { groupId?: string; error?: string };
      if (!response.ok || !data.groupId) {
        setError(data.error ?? 'Could not create the group.');
        setBusy(false);
        return;
      }
      router.push(`/groups/${data.groupId}`);
      router.refresh();
    } catch {
      setError('Network hiccup. Try again.');
      setBusy(false);
    }
  }

  async function joinGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => ({}))) as { groupId?: string; error?: string };
      if (!response.ok || !data.groupId) {
        setError(data.error ?? 'That code did not work.');
        setBusy(false);
        return;
      }
      router.push(`/groups/${data.groupId}`);
      router.refresh();
    } catch {
      setError('Network hiccup. Try again.');
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  function openPanel(next: Panel) {
    setPanel(next);
    setError(null);
  }

  return (
    <div className="screen home-screen">
      <header className="home-head">
        <div>
          <span className="eyebrow">Signed in as</span>
          <h1 className="home-head__name">
            {user.username}
            <Avatar name={user.username} size={26} />
          </h1>
        </div>
        <button type="button" className="text-btn" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="scroll-area">
        <div className="section-head">
          <h2 className="section-title">Your groups</h2>
          <span className="count">{groups.length}</span>
        </div>

        {groups.length === 0 ? (
          <div className="empty">
            <span className="empty__glyph" aria-hidden>
              <Users size={22} />
            </span>
            <h3>No group yet</h3>
            <p>
              Start one for your people, paste a code someone sent you, or find a community in Explore.
            </p>
          </div>
        ) : (
          <ul className="group-list">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  className="group-row"
                  onClick={() => router.push(`/groups/${group.id}`)}
                >
                  <AvatarStack names={group.memberNames} />
                  <span className="group-row__body">
                    <span className="group-row__name">{group.name}</span>
                    <span className="group-row__preview">
                      {group.lastMessage ?? 'No messages yet — say hello.'}
                    </span>
                    <span className="group-row__meta">
                      <span>
                        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      {group.finalizedAt ? (
                        <span className="pill pill--ink">Plan locked</span>
                      ) : group.eventAt ? (
                        <span className="pill" suppressHydrationWarning>
                          {formatEventChip(group.eventAt)}
                        </span>
                      ) : (
                        <span className="pill pill--muted">No date yet</span>
                      )}
                      {group.visibility === 'discoverable' ? (
                        <span className="pill pill--muted">Explore</span>
                      ) : null}
                      {group.role === 'admin' ? <span className="pill pill--accent">Admin</span> : null}
                      <span className="group-row__code" title="Invite code for this group">
                        {group.inviteCode}
                      </span>
                    </span>
                  </span>
                  <ArrowRight size={18} className="group-row__chevron" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="section-head section-head--spaced">
          <h2 className="section-title">Get people in</h2>
        </div>

        <div className="actions">
          <button
            type="button"
            className={`action-card${panel === 'create' ? ' is-open' : ''}`}
            onClick={() => openPanel(panel === 'create' ? null : 'create')}
            aria-expanded={panel === 'create'}
          >
            <span className="action-card__icon">
              <Plus size={18} />
            </span>
            <span>
              <span className="action-card__title">Start a group</span>
              <span className="action-card__hint">You become the admin</span>
            </span>
          </button>

          <button
            type="button"
            className={`action-card${panel === 'join' ? ' is-open' : ''}`}
            onClick={() => openPanel(panel === 'join' ? null : 'join')}
            aria-expanded={panel === 'join'}
          >
            <span className="action-card__icon">
              <Users size={18} />
            </span>
            <span>
              <span className="action-card__title">Join with a code</span>
              <span className="action-card__hint">Eight characters, no approval</span>
            </span>
          </button>

          <button type="button" className="action-card" onClick={() => router.push('/explore')}>
            <span className="action-card__icon">
              <Compass size={18} />
            </span>
            <span>
              <span className="action-card__title">Explore communities</span>
              <span className="action-card__hint">Open groups looking for people</span>
            </span>
          </button>
        </div>

        {panel === 'create' ? (
          <form className="inline-form" onSubmit={createGroup}>
            <label className="field">
              <span className="field__label">Group name</span>
              <input
                className="field__input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Adebayo @ 60"
                maxLength={60}
                required
              />
            </label>

            <div className="field">
              <span className="field__label">Who can join?</span>
              <div className="seg" role="group" aria-label="Who can join">
                <button
                  type="button"
                  className={`seg__btn${visibility === 'invite' ? ' is-active' : ''}`}
                  aria-pressed={visibility === 'invite'}
                  onClick={() => setVisibility('invite')}
                >
                  Invite only
                </button>
                <button
                  type="button"
                  className={`seg__btn${visibility === 'discoverable' ? ' is-active' : ''}`}
                  aria-pressed={visibility === 'discoverable'}
                  onClick={() => setVisibility('discoverable')}
                >
                  Discoverable
                </button>
              </div>
              <p className="micro">
                {visibility === 'invite'
                  ? 'Only people with the code or link can join. This is the default.'
                  : 'Listed in Explore. Any signed-in player can join, so keep it friendly.'}
              </p>
            </div>

            {visibility === 'discoverable' ? (
              <label className="field">
                <span className="field__label">Short description</span>
                <input
                  className="field__input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this community for?"
                  maxLength={140}
                />
              </label>
            ) : null}

            <button className="btn btn--ink btn--block" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </form>
        ) : null}

        {panel === 'join' ? (
          <form className="inline-form" onSubmit={joinGroup}>
            <label className="field">
              <span className="field__label">Invite code</span>
              <input
                className="field__input field__input--code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="OWAMBE60"
                maxLength={16}
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </label>
            <button className="btn btn--ink btn--block" type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join group'}
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="micro micro--foot">
          Private by default. Discoverable groups can be found in Explore, and the admin can switch
          back to invite-only at any time.
        </p>
      </div>
    </div>
  );
}
