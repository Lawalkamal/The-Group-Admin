'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CHEER_POINTS,
  DEFAULT_GOAL,
  GOAL_OPTIONS,
  SHARED_GOAL_SCENARIOS,
  findScenario,
} from '@/lib/activities';
import { timeAgo } from '@/lib/format';
import type {
  ActivityState,
  GroupRole,
  Member,
  SharedGoal,
  SharedGoalSummary,
} from '@/lib/types';
import { Avatar, AvatarStack } from './Avatar';
import { Check, Lock, Spark } from './icons';
import { Sheet } from './Sheet';

type Props = {
  groupId: string;
  meId: string;
  role: GroupRole;
  members: Member[];
  initialActivity: SharedGoal | null;
  onActivity: (activity: SharedGoal | null) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

const POLL_MS = 3000;

function signatureOf(activity: SharedGoal | null): string {
  if (!activity) return 'none';
  return [
    activity.id,
    activity.progress,
    activity.goal,
    activity.contributions.length,
    activity.cheers.length,
    activity.crew.length,
  ].join(':');
}

export function ActivitySheet({
  groupId,
  meId,
  role,
  members,
  initialActivity,
  onActivity,
  onClose,
  onError,
}: Props) {
  const [current, setCurrent] = useState<SharedGoal | null>(initialActivity);
  const [history, setHistory] = useState<SharedGoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState(SHARED_GOAL_SCENARIOS[0].id);
  // A solo group cannot reach 100 points in one story, so default to a target
  // it can actually finish. Larger groups still start at 100.
  const [goal, setGoal] = useState<number>(members.length > 1 ? DEFAULT_GOAL : GOAL_OPTIONS[0]);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const busyRef = useRef(false);
  const signatureRef = useRef(signatureOf(initialActivity));

  function apply(state: ActivityState) {
    setCurrent(state.current);
    setHistory(state.history);
    const signature = signatureOf(state.current);
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      onActivity(state.current);
    }
  }

  // Keep an open sheet live: someone else may contribute while it is visible.
  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (busyRef.current) return;
      try {
        const response = await fetch(`/api/groups/${groupId}/activity`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as ActivityState;
        if (alive) apply(data);
      } catch {
        // The chat poll will still show the strip; a later open retries.
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // apply/onActivity intentionally stay out: they are stable enough and
    // including them would restart the interval on every render.
  }, [groupId]);

  async function request(path: string, body?: unknown): Promise<ActivityState | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(path);
    try {
      const response = await fetch(`/api/groups/${groupId}/activity${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as ActivityState & { error?: string };
      if (!response.ok) {
        onError(data.error ?? 'That did not work.');
        return null;
      }
      apply(data);
      return data;
    } catch {
      onError('Network hiccup. Try again.');
      return null;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = await request('', { scenario: scenarioId, goal });
    if (next) {
      setNoteFor(null);
      setNote('');
    }
  }

  async function contribute(actionId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = await request('/contribute', { actionId, note });
    if (next) {
      setNoteFor(null);
      setNote('');
    }
  }

  const scenario = findScenario(scenarioId);
  const maxPossible = scenario
    ? members.length *
      (scenario.actions.reduce((total, action) => total + action.points, 0) + CHEER_POINTS)
    : 0;
  const canClose = current !== null && (role === 'admin' || current.createdById === meId);
  const percent = current
    ? Math.min(100, Math.round((current.progress / Math.max(1, current.goal)) * 100))
    : 0;

  return (
    <Sheet
      title={current ? 'Shared goal' : 'Start a shared goal'}
      kicker={current ? current.title : 'Fictional points, real teamwork'}
      onClose={onClose}
      footer={
        current ? (
          canClose ? (
            confirmClose ? (
              <div className="lock-confirm">
                <p>
                  Close at {current.progress} of {current.goal} points? It moves to history and cannot
                  be reopened.
                </p>
                <div className="lock-confirm__row">
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirmClose(false)}>
                    Keep playing
                  </button>
                  <button
                    type="button"
                    className="btn btn--ink"
                    disabled={busy === '/close'}
                    onClick={async () => {
                      const next = await request('/close');
                      if (next) setConfirmClose(false);
                    }}
                  >
                    {busy === '/close' ? 'Closing…' : 'Close goal'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-btn text-btn--muted" onClick={() => setConfirmClose(true)}>
                Close this goal early
              </button>
            )
          ) : (
            <p className="micro micro--center">
              Only the admin or {current.createdByName ?? 'the creator'} can close this goal.
            </p>
          )
        ) : (
          <p className="micro micro--center">
            Points are fictional. No money, tokens, purchases, or prizes.
          </p>
        )
      }
    >
      {loading && !current && history.length === 0 ? <p className="micro">Loading…</p> : null}

      {current ? (
        <>
          <section className="goal-hero">
            <div className="goal-hero__top">
              <span className="eyebrow">Progress</span>
              <span className="goal-hero__count">
                {current.progress} / {current.goal}
              </span>
            </div>
            <h3 className="goal-hero__title">{current.title}</h3>
            <p className="goal-hero__blurb">{current.blurb}</p>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={current.goal}
              aria-valuenow={Math.min(current.progress, current.goal)}
              aria-label="Goal progress"
            >
              <span className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <p className="micro">
              Started by {current.createdByName ?? 'someone'}. {current.crew.filter((member) => member.isMember).length}{' '}
              playing · {current.contributions.length} moves · {current.cheers.length} cheers
            </p>
          </section>

          <section className="plan-block">
            <div className="plan-block__head">
              <h3>The story</h3>
              <span className="count">{current.actions.length} actions</span>
            </div>
            <ul className="goal-actions">
              {current.actions.map((action) => {
                const doers = current.contributions.filter((move) => move.actionId === action.id);
                const myDone = doers.some((move) => move.userId === meId);
                const cheered = current.cheers.filter((cheer) => cheer.actionId === action.id);
                const myCheer = current.cheers.some(
                  (cheer) => cheer.userId === meId && cheer.actionId === action.id,
                );
                const spotlight = current.spotlightActionId === action.id;
                return (
                  <li key={action.id} className={`goal-action${spotlight ? ' is-spotlight' : ''}`}>
                    <div className="goal-action__top">
                      <div className="goal-action__name">
                        <p>{action.label}</p>
                        {spotlight ? <span className="goal-action__pick">Group pick</span> : null}
                      </div>
                      <span className="goal-action__points">+{action.points}</span>
                    </div>
                    <p className="goal-action__hint">{action.hint}</p>

                    <div className="goal-action__people">
                      {doers.length > 0 ? (
                        <span className="goal-action__stack">
                          <AvatarStack names={doers.map((move) => move.username)} max={5} />
                          <span className="goal-action__count">
                            {doers.length} {doers.length === 1 ? 'move' : 'moves'}
                          </span>
                        </span>
                      ) : (
                        <span className="goal-action__count">Nobody has done this yet.</span>
                      )}
                    </div>

                    <div className="goal-action__buttons">
                      {myDone ? (
                        <span className="mini-btn mini-btn--done">
                          <Check size={12} /> You did this
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            setNoteFor(action.id);
                            setNote('');
                          }}
                          disabled={busy !== null}
                        >
                          Do this
                        </button>
                      )}
                      <button
                        type="button"
                        className={`mini-btn mini-btn--cheer${myCheer ? ' is-active' : ''}`}
                        aria-pressed={myCheer}
                        disabled={busy !== null}
                        onClick={() => void request('/cheer', { actionId: action.id })}
                      >
                        <Spark size={12} />
                        {myCheer ? 'Cheered' : 'Cheer'}
                        {cheered.length > 0 ? <span className="cheer-count">{cheered.length}</span> : null}
                      </button>
                    </div>

                    {noteFor === action.id ? (
                      <form className="goal-note" onSubmit={(event) => contribute(action.id, event)}>
                        <label className="field">
                          <span className="field__label">What did you do?</span>
                          <input
                            className="field__input"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="One line for the story (optional)"
                            maxLength={140}
                            autoFocus
                          />
                        </label>
                        <div className="row-buttons">
                          <button type="button" className="btn btn--ghost" onClick={() => setNoteFor(null)}>
                            Cancel
                          </button>
                          <button type="submit" className="btn btn--ink" disabled={busy !== null}>
                            {busy === '/contribute' ? 'Adding…' : `Add +${action.points} pts`}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="micro">
              Each person can do an action once. Cheering is free and adds +{CHEER_POINTS} momentum, so
              the group can finish together.
            </p>
          </section>

          <section className="plan-block">
            <div className="plan-block__head">
              <h3>Who is playing</h3>
              <span className="count">{current.crew.length}</span>
            </div>
            <ul className="goal-crew">
              {current.crew.map((member) => (
                <li key={member.userId} className="goal-crew__row">
                  <Avatar name={member.username} size={26} />
                  <span className="goal-crew__name">
                    {member.username}
                    {member.userId === meId ? <span className="member-row__you">you</span> : null}
                    {!member.isMember ? <span className="goal-crew__left">left</span> : null}
                  </span>
                  <span className="goal-crew__score">
                    {member.points} pts · {member.moves} {member.moves === 1 ? 'move' : 'moves'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {current.contributions.length > 0 ? (
            <section className="plan-block">
              <div className="plan-block__head">
                <h3>Latest moves</h3>
                <span className="count">{current.contributions.length}</span>
              </div>
              <ul className="goal-moves">
                {[...current.contributions]
                  .slice(-6)
                  .reverse()
                  .map((move) => (
                    <li key={move.id} className="goal-move">
                      <span className="goal-move__top">
                        <span className="goal-move__who">{move.username}</span>
                        <span className="goal-move__action">{move.actionLabel}</span>
                        <span className="goal-move__points">+{move.points}</span>
                      </span>
                      {move.note ? <span className="goal-move__note">{move.note}</span> : null}
                      <span className="goal-move__time" suppressHydrationWarning>
                        {timeAgo(move.createdAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <form className="goal-start" onSubmit={start}>
            <p className="lede lede--tight">
              Pick a story. Everyone can add fictional points by doing an action, or cheer the action
              the group should take next.
            </p>

            <section className="plan-block">
              <div className="plan-block__head">
                <h3>Choose a story</h3>
              </div>
              <ul className="goal-scenarios">
                {SHARED_GOAL_SCENARIOS.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={`goal-scenario${scenarioId === option.id ? ' is-selected' : ''}`}
                      aria-pressed={scenarioId === option.id}
                      onClick={() => setScenarioId(option.id)}
                    >
                      <span className="goal-scenario__name">{option.title}</span>
                      <span className="goal-scenario__meta">
                        {option.actions.length} actions · up to{' '}
                        {option.actions.reduce((total, action) => total + action.points, 0)} pts each
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {scenario ? <p className="plan-note plan-note--muted">{scenario.blurb}</p> : null}
            </section>

            <section className="plan-block">
              <div className="plan-block__head">
                <h3>Set the goal</h3>
                <span className="count">{members.length} playing</span>
              </div>
              <div className="seg" role="group" aria-label="Goal size">
                {GOAL_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`seg__btn${goal === option ? ' is-active' : ''}`}
                    aria-pressed={goal === option}
                    disabled={option > maxPossible}
                    onClick={() => setGoal(option)}
                  >
                    {option}
                    <span className="seg__count">pts</span>
                  </button>
                ))}
              </div>
              {scenario ? (
                <p className="micro">
                  With {members.length} {members.length === 1 ? 'person' : 'people'}, this story can reach{' '}
                  {maxPossible} points.{' '}
                  {goal > maxPossible
                    ? 'Pick a smaller goal, or bring someone else in.'
                    : 'Bigger goals need more people.'}
                </p>
              ) : null}
            </section>

            <button
              className="btn btn--ink btn--block"
              type="submit"
              disabled={busy !== null || goal > maxPossible}
            >
              {busy === '' ? 'Starting…' : 'Start shared goal'}
            </button>
            <p className="micro micro--center">Anyone in the group can start it. One goal at a time.</p>
          </form>

          {history.length > 0 ? (
            <section className="plan-block">
              <div className="plan-block__head">
                <h3>Past goals</h3>
                <span className="count">{history.length}</span>
              </div>
              <ul className="goal-history">
                {history.map((item) => (
                  <li key={item.id} className="goal-history__row">
                    <div className="goal-history__body">
                      <p className="goal-history__title">{item.title}</p>
                      <p className="goal-history__outcome">{item.outcome}</p>
                      <p className="goal-history__meta" suppressHydrationWarning>
                        {item.status === 'complete' ? <Check size={11} /> : <Lock size={11} />}
                        {item.finalProgress} / {item.goal} pts · {item.participants}{' '}
                        {item.participants === 1 ? 'person' : 'people'}
                        {item.completedAt ? ` · ${timeAgo(item.completedAt)}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
