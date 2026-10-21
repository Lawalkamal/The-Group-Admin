'use client';

import { useState } from 'react';
import { Avatar } from './Avatar';
import { Check, Lock, Pin, Plus } from './icons';
import { Sheet } from './Sheet';
import type { GroupRole, Member, Plan } from '@/lib/types';
import type { RsvpStatus } from '@/lib/validate';
import { formatEventFull, relativeEvent, toLocalInput } from '@/lib/format';

type Props = {
  groupId: string;
  meId: string;
  plan: Plan;
  members: Member[];
  role: GroupRole;
  onPlan: (plan: Plan) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

const RSVP_OPTIONS: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'yes', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'Cannot' },
];

export function PlanSheet({ groupId, meId, plan, members, role, onPlan, onClose, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState(toLocalInput(plan.eventAt));
  const [budgetDraft, setBudgetDraft] = useState(plan.budgetNote);
  const [locationDraft, setLocationDraft] = useState(plan.locationNote);
  const [venueName, setVenueName] = useState('');
  const [venueNote, setVenueNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const locked = Boolean(plan.finalizedAt);
  const isAdmin = role === 'admin';
  const myRsvp = plan.rsvps.find((rsvp) => rsvp.userId === meId)?.status ?? null;
  const counts = {
    yes: plan.rsvps.filter((rsvp) => rsvp.status === 'yes').length,
    maybe: plan.rsvps.filter((rsvp) => rsvp.status === 'maybe').length,
    no: plan.rsvps.filter((rsvp) => rsvp.status === 'no').length,
  };
  const ranked = [...plan.venues].sort((a, b) => b.voters.length - a.voters.length);
  const leader = ranked[0] ?? null;
  const nameFor = (userId: string) =>
    members.find((member) => member.id === userId)?.username ?? 'Member';

  async function send(action: string, path: string, method: string, payload?: unknown): Promise<Plan | null> {
    if (busy) return null;
    setBusy(action);
    try {
      const response = await fetch(`/api/groups/${groupId}/plan${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { plan?: Plan; error?: string };
      if (!response.ok || !data.plan) {
        onError(data.error ?? 'That did not work.');
        return null;
      }
      onPlan(data.plan);
      return data.plan;
    } catch {
      onError('Network hiccup. Try again.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function saveDetails() {
    const planNext = await send('details', '', 'PATCH', {
      eventAt: dateDraft ? new Date(dateDraft).toISOString() : null,
      budgetNote: budgetDraft,
      locationNote: locationDraft,
    });
    if (planNext) {
      setDateDraft(toLocalInput(planNext.eventAt));
      setShowSettings(false);
    }
  }

  async function addVenue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = await send('venue', '/venues', 'POST', { name: venueName, note: venueNote });
    if (next) {
      setVenueName('');
      setVenueNote('');
      setAdding(false);
    }
  }

  return (
    <Sheet
      title="Party plan"
      kicker={plan.title}
      onClose={onClose}
      footer={
        isAdmin && !locked ? (
          confirmLock ? (
            <div className="lock-confirm">
              <p>
                Lock the plan for good? {leader ? `${leader.name} becomes the venue.` : 'No venue is chosen.'}
              </p>
              <div className="lock-confirm__row">
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmLock(false)}>
                  Not yet
                </button>
                <button
                  type="button"
                  className="btn btn--ink"
                  disabled={busy === 'lock'}
                  onClick={() => send('lock', '/finalize', 'POST', { venueId: leader?.id ?? null })}
                >
                  {busy === 'lock' ? 'Locking…' : 'Lock plan'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn--ink btn--block" onClick={() => setConfirmLock(true)}>
              <Lock size={16} /> Confirm &amp; lock plan
            </button>
          )
        ) : locked ? (
          <p className="micro micro--center">
            Locked {new Date(plan.finalizedAt as string).toLocaleDateString()}. Voting and edits are closed.
          </p>
        ) : (
          <p className="micro micro--center">The admin confirms the plan once the group has voted.</p>
        )
      }
    >
      <div className="plan-hero">
        <span className="eyebrow">When</span>
        <p className="plan-hero__date" suppressHydrationWarning>
          {plan.eventAt ? formatEventFull(plan.eventAt) : 'No date set yet'}
        </p>
        <p className="plan-hero__rel" suppressHydrationWarning>
          {plan.eventAt ? relativeEvent(plan.eventAt) : isAdmin ? 'Set a date below.' : 'The admin will set a date.'}
        </p>
        {locked ? (
          <span className="pill pill--ink">
            <Lock size={12} /> Plan locked
          </span>
        ) : null}
      </div>

      <section className="plan-block">
        <div className="plan-block__head">
          <h3>Who is coming</h3>
          <span className="count">{counts.yes + counts.maybe} of {plan.rsvps.length}</span>
        </div>
        <div className="seg" role="group" aria-label="Your RSVP">
          {RSVP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`seg__btn${myRsvp === option.value ? ' is-active' : ''}`}
              aria-pressed={myRsvp === option.value}
              disabled={busy === 'rsvp'}
              onClick={() => send('rsvp', '/rsvp', 'POST', { status: option.value })}
            >
              {option.label}
              <span className="seg__count">
                {option.value === 'yes' ? counts.yes : option.value === 'maybe' ? counts.maybe : counts.no}
              </span>
            </button>
          ))}
        </div>
        <ul className="rsvp-list">
          {plan.rsvps.map((rsvp) => (
            <li key={rsvp.userId} className={`rsvp rsvp--${rsvp.status}`}>
              <Avatar name={rsvp.username} size={22} />
              <span>{rsvp.username}</span>
              <span className="rsvp__status">
                {rsvp.status === 'yes' ? 'going' : rsvp.status === 'maybe' ? 'maybe' : 'cannot'}
              </span>
            </li>
          ))}
          {plan.rsvps.length === 0 ? <li className="rsvp-empty">Nobody has replied yet.</li> : null}
        </ul>
      </section>

      <section className="plan-block">
        <div className="plan-block__head">
          <h3>Venues</h3>
          <span className="count">{plan.venues.length}</span>
        </div>

        {plan.venues.length === 0 ? (
          <div className="mini-empty">
            <Pin size={18} />
            <p>No venue yet. Anyone in the group can propose one — the votes decide.</p>
          </div>
        ) : (
          <ul className="venue-list">
            {ranked.map((venue, index) => {
              const voted = venue.voters.includes(meId);
              const leading = index === 0 && venue.voters.length > 0;
              return (
                <li key={venue.id} className={`venue${leading ? ' is-leading' : ''}`}>
                  <div className="venue__top">
                    <div>
                      <p className="venue__name">
                        {venue.name}
                        {leading ? <span className="venue__lead">Leading</span> : null}
                      </p>
                      {venue.note ? <p className="venue__note">{venue.note}</p> : null}
                      <p className="venue__by">
                        Proposed by {venue.proposedByName ?? 'someone'} · {venue.voters.length}{' '}
                        {venue.voters.length === 1 ? 'vote' : 'votes'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`vote-btn${voted ? ' is-voted' : ''}`}
                      aria-pressed={voted}
                      disabled={locked || busy === `vote-${venue.id}`}
                      onClick={() => send(`vote-${venue.id}`, '/votes', 'POST', { venueId: venue.id })}
                    >
                      {voted ? <Check size={14} /> : <Plus size={14} />}
                      {voted ? 'Voted' : 'Vote'}
                    </button>
                  </div>
                  {venue.voters.length > 0 ? (
                    <div className="venue__voters" aria-hidden>
                      {venue.voters.slice(0, 5).map((voter) => (
                        <Avatar key={voter} name={nameFor(voter)} size={20} />
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!locked ? (
          adding ? (
            <form className="inline-form inline-form--tight" onSubmit={addVenue}>
              <label className="field">
                <span className="field__label">Venue</span>
                <input
                  className="field__input"
                  value={venueName}
                  onChange={(event) => setVenueName(event.target.value)}
                  placeholder="e.g. Balmoral Hall, VI"
                  maxLength={80}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Note (optional)</span>
                <input
                  className="field__input"
                  value={venueNote}
                  onChange={(event) => setVenueNote(event.target.value)}
                  placeholder="Cost, capacity, parking…"
                  maxLength={160}
                />
              </label>
              <div className="row-buttons">
                <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--ink" disabled={busy === 'venue'}>
                  {busy === 'venue' ? 'Adding…' : 'Add venue'}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="add-row" onClick={() => setAdding(true)}>
              <Plus size={16} /> Propose a venue
            </button>
          )
        ) : null}
      </section>

      <section className="plan-block">
        <div className="plan-block__head">
          <h3>Money</h3>
        </div>
        <p className="plan-note">{plan.budgetNote || 'No budget note yet.'}</p>
        <p className="plan-note plan-note--muted">
          <Pin size={13} /> {plan.locationNote || 'No venue confirmed.'}
        </p>
      </section>

      {isAdmin && !locked ? (
        <section className="plan-block">
          <button type="button" className="add-row" onClick={() => setShowSettings((value) => !value)}>
            {showSettings ? 'Hide plan settings' : 'Edit date & notes'}
          </button>
          {showSettings ? (
            <div className="inline-form inline-form--tight">
              <label className="field">
                <span className="field__label">Date &amp; time</span>
                <input
                  className="field__input"
                  type="datetime-local"
                  value={dateDraft}
                  onChange={(event) => setDateDraft(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Budget note</span>
                <input
                  className="field__input"
                  value={budgetDraft}
                  onChange={(event) => setBudgetDraft(event.target.value)}
                  maxLength={200}
                  placeholder="Pledged, received, deposits…"
                />
              </label>
              <label className="field">
                <span className="field__label">Confirmed venue</span>
                <input
                  className="field__input"
                  value={locationDraft}
                  onChange={(event) => setLocationDraft(event.target.value)}
                  maxLength={120}
                  placeholder="Where it is happening"
                />
              </label>
              <button
                type="button"
                className="btn btn--ink btn--block"
                disabled={busy === 'details'}
                onClick={saveDetails}
              >
                {busy === 'details' ? 'Saving…' : 'Save plan details'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}
