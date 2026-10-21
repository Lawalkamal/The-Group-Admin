'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarStack } from './Avatar';
import { ArrowRight, Plus, Users } from './icons';
import type { GroupSummary } from '@/lib/types';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
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
              Start one for your owambe, or paste the code someone sent you. Groups stay private to the
              people inside.
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
                      {group.role === 'admin' ? <span className="pill pill--accent">Admin</span> : null}
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
          Invite-only by design: no public directory, no discovery, no strangers.
        </p>
      </div>
    </div>
  );
}

