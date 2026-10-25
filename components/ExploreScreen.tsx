'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AvatarStack } from './Avatar';
import { ChevronLeft, Compass, Spark, Users } from './icons';
import { timeAgo } from '@/lib/format';
import type { ExploreGroup } from '@/lib/types';

export function ExploreScreen({ initialGroups }: { initialGroups: ExploreGroup[] }) {
  const router = useRouter();
  const [groups] = useState(initialGroups);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(group: ExploreGroup) {
    if (joining) return;
    setJoining(group.id);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${group.id}/join`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { groupId?: string; error?: string };
      if (!response.ok || !data.groupId) {
        setError(data.error ?? 'Could not join that community.');
        setJoining(null);
        return;
      }
      router.push(`/groups/${data.groupId}`);
      router.refresh();
    } catch {
      setError('Network hiccup. Try again.');
      setJoining(null);
    }
  }

  return (
    <div className="screen explore-screen">
      <header className="explore-head">
        <button type="button" className="icon-btn" onClick={() => router.push('/groups')} aria-label="All groups">
          <ChevronLeft size={22} />
        </button>
        <div className="explore-head__id">
          <span className="eyebrow">Discover</span>
          <h1 className="explore-head__name">Explore</h1>
        </div>
        <span className="count">{groups.length}</span>
      </header>

      <div className="scroll-area">
        <p className="lede lede--tight">
          Open communities from other players. Join one and you are in — no code needed.
        </p>

        {groups.length === 0 ? (
          <div className="empty">
            <span className="empty__glyph" aria-hidden>
              <Compass size={22} />
            </span>
            <h3>No open communities yet</h3>
            <p>
              Every group is invite-only until its admin makes it discoverable. Start one and open it
              up, or ask someone for their code.
            </p>
          </div>
        ) : (
          <ul className="explore-list">
            {groups.map((group) => (
              <li key={group.id} className="explore-card">
                <div className="explore-card__top">
                  <AvatarStack names={group.memberNames} max={4} />
                  <span className="explore-card__age" suppressHydrationWarning>
                    <span className={`dot${group.lastAt ? ' is-live' : ''}`} />
                    {timeAgo(group.lastAt)}
                  </span>
                </div>

                <p className="explore-card__name">{group.name}</p>
                <p className="explore-card__description">
                  {group.description || 'A group for people who want to do something together.'}
                </p>

                <div className="explore-card__meta">
                  <span>
                    <Users size={12} /> {group.memberCount}{' '}
                    {group.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  {group.activityTitle ? (
                    <span className="pill pill--accent">
                      <Spark size={11} /> {group.activityTitle}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="btn btn--ink btn--block explore-card__join"
                  onClick={() => join(group)}
                  disabled={joining === group.id}
                >
                  {joining === group.id ? 'Joining…' : 'Join community'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="micro micro--foot">
          Discoverable groups are public listings with private chat. Members can report or block anyone
          from the People sheet.
        </p>
      </div>
    </div>
  );
}
