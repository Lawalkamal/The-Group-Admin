'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/format';
import type { GroupRole, GroupVisibility, Member, Report, ReportReason } from '@/lib/types';
import { REPORT_REASONS } from '@/lib/validate';
import { Avatar } from './Avatar';
import { Check, Copy, Flag, More, Shield, Users } from './icons';
import { Sheet } from './Sheet';

type Props = {
  groupId: string;
  meId: string;
  role: GroupRole;
  members: Member[];
  inviteCode: string;
  visibility: GroupVisibility;
  blockedIds: string[];
  onMembers: (members: Member[]) => void;
  onCode: (code: string) => void;
  onVisibility: (visibility: GroupVisibility) => void;
  onBlockedChange: (blockedIds: string[]) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

function reasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((option) => option.value === reason)?.label ?? reason;
}

export function MembersSheet({
  groupId,
  meId,
  role,
  members,
  inviteCode,
  visibility,
  blockedIds,
  onMembers,
  onCode,
  onVisibility,
  onBlockedChange,
  onClose,
  onError,
  onNotice,
}: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<Member | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [reportNote, setReportNote] = useState('');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  async function loadReports() {
    if (!isAdmin) return;
    try {
      const response = await fetch(`/api/groups/${groupId}/reports`, { cache: 'no-store' });
      if (!response.ok) {
        setReports([]);
        return;
      }
      const data = (await response.json()) as { reports?: Report[] };
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch {
      setReports([]);
    }
  }

  useEffect(() => {
    void loadReports();
    // Reports are only available to the admin; reload when the role changes.
  }, [groupId, isAdmin]);

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
      onNotice('New code. The old one no longer works.');
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function changeVisibility(next: GroupVisibility) {
    if (busy || next === visibility) return;
    setBusy('visibility');
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        settings?: { visibility: GroupVisibility };
        error?: string;
      };
      if (!response.ok || !data.settings) {
        onError(data.error ?? 'Could not update the community.');
        return;
      }
      onVisibility(data.settings.visibility);
      onNotice(
        next === 'discoverable'
          ? 'Listed in Explore. Any signed-in player can join.'
          : 'Back to invite-only. New people need the code again.',
      );
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
      onNotice('Removed. Their RSVP and venue votes were cleared.');
      setRemoving(null);
      setOpenActions(null);
      void loadReports();
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleBlock(member: Member) {
    if (busy) return;
    setBusy(`block-${member.id}`);
    try {
      const response = await fetch(`/api/users/${member.id}/block`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as {
        blocked?: boolean;
        blockedIds?: string[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.blockedIds)) {
        onError(data.error ?? 'Could not update that block.');
        return;
      }
      onBlockedChange(data.blockedIds);
      onNotice(
        data.blocked
          ? `Blocked ${member.username}. Their messages are hidden from you.`
          : `Unblocked ${member.username}.`,
      );
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function openReport(member: Member) {
    setReportTarget(member);
    setReportReason('harassment');
    setReportNote('');
    setOpenActions(null);
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget || busy) return;
    setBusy('report');
    try {
      const response = await fetch(`/api/groups/${groupId}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetId: reportTarget.id,
          reason: reportReason,
          note: reportNote,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        onError(data.error ?? 'Could not send the report.');
        return;
      }
      onNotice('Report sent to the admin.');
      setReportTarget(null);
      void loadReports();
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function resolveReport(reportId: string) {
    if (resolving) return;
    setResolving(reportId);
    try {
      const response = await fetch(`/api/groups/${groupId}/reports`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const data = (await response.json().catch(() => ({}))) as { reports?: Report[]; error?: string };
      if (!response.ok || !data.reports) {
        onError(data.error ?? 'Could not resolve that report.');
        return;
      }
      setReports(data.reports);
      onNotice('Report marked handled.');
    } catch {
      onError('Network hiccup. Try again.');
    } finally {
      setResolving(null);
    }
  }

  const link = typeof window === 'undefined' ? `/join/${inviteCode}` : `${window.location.origin}/join/${inviteCode}`;

  return (
    <Sheet
      title={reportTarget ? 'Report a member' : 'People'}
      kicker={reportTarget ? `About ${reportTarget.username}` : `${members.length} in the group`}
      onClose={onClose}
    >
      {reportTarget ? (
        <>
          <button type="button" className="text-btn text-btn--muted" onClick={() => setReportTarget(null)}>
            ← Back to people
          </button>
          <div className="report-target">
            <Avatar name={reportTarget.username} size={34} />
            <div>
              <p className="report-target__name">{reportTarget.username}</p>
              <p className="micro">The group admin sees this report. They decide what happens next.</p>
            </div>
          </div>

          <form className="inline-form inline-form--tight" onSubmit={submitReport}>
            <div className="field">
              <span className="field__label">Reason</span>
              <div className="report-reasons" role="group" aria-label="Report reason">
                {REPORT_REASONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`report-reason${reportReason === option.value ? ' is-active' : ''}`}
                    aria-pressed={reportReason === option.value}
                    onClick={() => setReportReason(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="field__label">What happened? (optional)</span>
              <input
                className="field__input"
                value={reportNote}
                onChange={(event) => setReportNote(event.target.value)}
                placeholder="A short note for the admin"
                maxLength={200}
              />
            </label>
            <button type="submit" className="btn btn--ink btn--block" disabled={busy !== null}>
              {busy === 'report' ? 'Sending…' : 'Send report'}
            </button>
            <p className="micro">
              Reports are private to you and the admin. You can also block this person to hide their
              messages.
            </p>
          </form>
        </>
      ) : (
        <>
          <section className="invite-block">
            <span className="eyebrow">Invite code</span>
            <div className="code">
              <span className="code__value">{inviteCode}</span>
              <button
                type="button"
                className="icon-btn icon-btn--ink"
                onClick={() => copy(inviteCode, 'code')}
                aria-label="Copy invite code"
              >
                {copied === 'code' ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <div className="row-buttons">
              <button type="button" className="btn btn--ghost" onClick={() => copy(link, 'link')}>
                {copied === 'link' ? <Check size={16} /> : <Copy size={16} />}
                {copied === 'link' ? 'Link copied' : 'Copy invite link'}
              </button>
              {isAdmin ? (
                <button type="button" className="btn btn--ghost" onClick={rotate} disabled={busy === 'rotate'}>
                  {busy === 'rotate' ? 'Rotating…' : 'New code'}
                </button>
              ) : null}
            </div>
            <p className="micro">
              {visibility === 'discoverable'
                ? 'This group is also listed in Explore. The code still works for a direct invite.'
                : 'Anyone with the code joins instantly. Rotate it when you are done inviting.'}
            </p>
          </section>

          {isAdmin ? (
            <section className="plan-block">
              <div className="plan-block__head">
                <h3>Community</h3>
                <span className={`pill${visibility === 'discoverable' ? ' pill--accent' : ' pill--muted'}`}>
                  {visibility === 'discoverable' ? 'In Explore' : 'Invite only'}
                </span>
              </div>
              <div className="seg" role="group" aria-label="Community access">
                <button
                  type="button"
                  className={`seg__btn${visibility === 'invite' ? ' is-active' : ''}`}
                  aria-pressed={visibility === 'invite'}
                  disabled={busy === 'visibility'}
                  onClick={() => changeVisibility('invite')}
                >
                  Invite only
                </button>
                <button
                  type="button"
                  className={`seg__btn${visibility === 'discoverable' ? ' is-active' : ''}`}
                  aria-pressed={visibility === 'discoverable'}
                  disabled={busy === 'visibility'}
                  onClick={() => changeVisibility('discoverable')}
                >
                  Discoverable
                </button>
              </div>
              <p className="micro">
                {visibility === 'discoverable'
                  ? 'Anyone signed in can find this group in Explore and join without a code.'
                  : 'Only people with the code or link can join. This is the default.'}
              </p>

              <div className="plan-block__head report-head">
                <h3>Reports</h3>
                <span className="count">{reports?.length ?? 0}</span>
              </div>
              {reports === null ? (
                <p className="micro">Loading reports…</p>
              ) : reports.length === 0 ? (
                <p className="micro">No open reports. Members can report someone from the People list.</p>
              ) : (
                <ul className="report-list">
                  {reports.map((report) => (
                    <li key={report.id} className="report-row">
                      <div className="report-row__top">
                        <span className="report-row__who">
                          {report.reporterName} → {report.targetName}
                        </span>
                        <span className="report-row__reason">{reasonLabel(report.reason)}</span>
                      </div>
                      {report.note ? <p className="report-row__note">{report.note}</p> : null}
                      <div className="report-row__foot">
                        <span className="report-row__time" suppressHydrationWarning>
                          {timeAgo(report.createdAt)}
                        </span>
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={resolving === report.id}
                          onClick={() => void resolveReport(report.id)}
                        >
                          {resolving === report.id ? 'Saving…' : 'Mark handled'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className="plan-block">
            <div className="plan-block__head">
              <h3>Members</h3>
              <span className="count">{members.length}</span>
            </div>
            <ul className="member-list">
              {members.map((member) => {
                const isMe = member.id === meId;
                const blocked = blockedIds.includes(member.id);
                return (
                  <li key={member.id} className="member-row-wrap">
                    <div className="member-row">
                      <Avatar name={member.username} size={32} />
                      <div className="member-row__body">
                        <span className="member-row__name">
                          {member.username}
                          {isMe ? <span className="member-row__you">you</span> : null}
                          {blocked ? <span className="member-row__blocked">blocked</span> : null}
                        </span>
                        <span className="member-row__meta">
                          {member.role === 'admin' ? 'Admin · can lock the plan' : 'Member · can vote and plan'}
                        </span>
                      </div>
                      {!isMe ? (
                        <button
                          type="button"
                          className="icon-btn icon-btn--small"
                          aria-label={`Actions for ${member.username}`}
                          aria-expanded={openActions === member.id}
                          onClick={() => setOpenActions(openActions === member.id ? null : member.id)}
                        >
                          <More size={16} />
                        </button>
                      ) : null}
                    </div>

                    {openActions === member.id ? (
                      <div className="member-row__actions">
                        <button type="button" className="mini-btn" onClick={() => openReport(member)}>
                          <Flag size={11} /> Report
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          disabled={busy === `block-${member.id}`}
                          onClick={() => void toggleBlock(member)}
                        >
                          <Shield size={11} /> {blocked ? 'Unblock' : 'Block'}
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="mini-btn mini-btn--danger"
                            onClick={() => setRemoving(member.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {removing === member.id ? (
                      <div className="member-remove">
                        <p>
                          Remove {member.username}? Their current RSVP and venue votes are cleared. Past
                          messages stay.
                        </p>
                        <div className="row-buttons">
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setRemoving(null)}
                            disabled={busy === member.id}
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className="btn btn--ink"
                            onClick={() => void remove(member.id)}
                            disabled={busy === member.id}
                          >
                            {busy === member.id ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="micro micro--foot">
            <Users size={12} /> Membership is what grants access. Removing someone revokes it at once,
            clears their RSVP and venue votes, and keeps the chat history.
          </p>
        </>
      )}
    </Sheet>
  );
}
