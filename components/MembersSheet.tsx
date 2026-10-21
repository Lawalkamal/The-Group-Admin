'use client';

import { useState } from 'react';
import { Avatar } from './Avatar';
import { Check, Copy, Users } from './icons';
import { Sheet } from './Sheet';
import type { GroupRole, Member } from '@/lib/types';

type Props = {
  groupId: string;
  meId: string;
  role: GroupRole;
  members: Member[];
  inviteCode: string;
  onMembers: (members: Member[]) => void;
  onCode: (code: string) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

export function MembersSheet({
  groupId,
  meId,
  role,
  members,
  inviteCode,
  onMembers,
  onCode,
  onClose,
  onError,
}: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function copy(value: string, kind: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      onError('Copying was blocked. Select the code manually.');
    }
  }

  async function rotate() {
    if (busy) return;
    setBusy('rotate');
    try {
      const response = await fetch(`/api/groups/${groupId}/invite`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { inviteCode?: string; error?: string };
      if (!response.ok || !data.inviteCode) {
        onError(data.error ?? 'Could not rotate the code.');
        return;
      }
      onCode(data.inviteCode);
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(memberId: string) {
    if (busy) return;
    setBusy(memberId);
    try {
      const response = await fetch(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as { members?: Member[]; error?: string };
      if (!response.ok || !data.members) {
        onError(data.error ?? 'Could not remove that member.');
        return;
      }
      onMembers(data.members);
      setRemoving(null);
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const link = typeof window === 'undefined' ? `/join/${inviteCode}` : `${window.location.origin}/join/${inviteCode}`;

  return (
    <Sheet title="People" kicker={`${members.length} in the group`} onClose={onClose}>
      <section className="invite-block">
        <span className="eyebrow">Invite code</span>
        <div className="code">
          <span className="code__value">{inviteCode}</span>
          <button type="button" className="icon-btn icon-btn--ink" onClick={() => copy(inviteCode, 'code')} aria-label="Copy invite code">
            {copied === 'code' ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="row-buttons">
          <button type="button" className="btn btn--ghost" onClick={() => copy(link, 'link')}>
            {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
            {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          {role === 'admin' ? (
            <button type="button" className="btn btn--ghost" onClick={rotate} disabled={busy === 'rotate'}>
              {busy === 'rotate' ? 'Rotating…' : 'New code'}
            </button>
          ) : null}
        </div>
        <p className="micro">
          Anyone with the code joins instantly and can read this group. Rotate it when you are done inviting.
        </p>
      </section>

      <section className="plan-block">
        <div className="plan-block__head">
          <h3>Members</h3>
          <span className="count">{members.length}</span>
        </div>
        <ul className="member-list">
          {members.map((member) => {
            const isMe = member.id === meId;
            return (
              <li key={member.id} className="member-row">
                <Avatar name={member.username} size={32} />
                <div className="member-row__body">
                  <span className="member-row__name">
                    {member.username}
                    {isMe ? <span className="member-row__you">you</span> : null}
                  </span>
                  <span className="member-row__meta">
                    {member.role === 'admin' ? 'Admin · can lock the plan' : 'Member · can vote and RSVP'}
                  </span>
                </div>
                {role === 'admin' && !isMe ? (
                  removing === member.id ? (
                    <span className="member-row__confirm">
                      <button
                        type="button"
                        className="mini-btn mini-btn--danger"
                        onClick={() => remove(member.id)}
                        disabled={busy === member.id}
                      >
                        Remove
                      </button>
                      <button type="button" className="mini-btn" onClick={() => setRemoving(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="text-btn text-btn--muted" onClick={() => setRemoving(member.id)}>
                      Remove
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="micro micro--foot">
        <Users size={12} /> Membership is what grants access. Removing someone revokes it at once.
      </p>
    </Sheet>
  );
}
