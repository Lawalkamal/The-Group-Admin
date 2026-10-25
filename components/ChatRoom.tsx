'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivitySheet } from './ActivitySheet';
import { Avatar } from './Avatar';
import { Calendar, Check, ChevronLeft, Send, Spark, Users } from './icons';
import { MembersSheet } from './MembersSheet';
import { PlanSheet } from './PlanSheet';
import { dayKey, formatClock, formatDayLabel, formatEventChip, relativeEvent } from '@/lib/format';
import { mergeMessages, type LocalMessage } from '@/lib/messages';
import type {
  ChatMessage,
  GroupRole,
  GroupSnapshot,
  GroupVisibility,
  Member,
  Plan,
  SharedGoal,
  SyncPayload,
} from '@/lib/types';

const POLL_MS = 2000;

export function ChatRoom({ me, group }: { me: { id: string; username: string }; group: GroupSnapshot }) {
  const router = useRouter();
  const [messages, setMessages] = useState<LocalMessage[]>(group.messages);
  const [plan, setPlan] = useState<Plan>(group.plan);
  const [members, setMembers] = useState<Member[]>(group.members);
  const [role, setRole] = useState<GroupRole>(group.role);
  const [inviteCode, setInviteCode] = useState(group.inviteCode);
  const [visibility, setVisibility] = useState<GroupVisibility>(group.visibility);
  const [activity, setActivity] = useState<SharedGoal | null>(group.activity);
  const [blockedIds, setBlockedIds] = useState<string[]>(group.blockedIds);
  const [sheet, setSheet] = useState<'plan' | 'members' | 'activity' | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [connection, setConnection] = useState<'live' | 'offline'>('live');
  const [mounted, setMounted] = useState(false);

  const lastSeqRef = useRef(group.lastSeq);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Poll for other people's messages, the plan, the goal, and blocks.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      while (alive) {
        if (document.visibilityState === 'visible') {
          try {
            const response = await fetch(`/api/groups/${group.id}/sync?after=${lastSeqRef.current}`, {
              cache: 'no-store',
            });
            if (response.status === 401) {
              router.replace('/login');
              return;
            }
            if (response.ok) {
              const data = (await response.json()) as SyncPayload;
              if (!alive) return;
              setConnection('live');
              if (data.messages.length > 0) {
                setMessages((current) => mergeMessages(current, data.messages));
              }
              lastSeqRef.current = Math.max(lastSeqRef.current, data.lastSeq);
              setPlan(data.plan);
              setMembers(data.members);
              setActivity(data.activity);
              setBlockedIds(data.blockedIds);
              setRole(data.role);
            } else {
              setConnection('offline');
            }
          } catch {
            setConnection('offline');
          }
        }
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, POLL_MS);
        });
      }
    };

    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [group.id, router]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    if (stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const toBottom = () => {
      element.scrollTop = element.scrollHeight;
    };
    toBottom();
    // Web fonts land after first paint and change message heights.
    document.fonts?.ready.then(() => {
      if (stickRef.current) toBottom();
    });
  }, []);

  function handleScroll() {
    const element = listRef.current;
    if (!element) return;
    stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const optimistic: LocalMessage = {
      seq: Number.MAX_SAFE_INTEGER,
      id: localId,
      kind: 'user',
      body,
      authorId: me.id,
      authorName: me.username,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimistic]);
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setSending(true);
    stickRef.current = true;

    try {
      const response = await fetch(`/api/groups/${group.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: ChatMessage; error?: string };
      if (!response.ok || !data.message) {
        throw new Error(data.error ?? 'Message not sent.');
      }
      const saved = data.message;
      // Do not move the poll cursor here: other messages may have arrived since
      // the last poll, and jumping ahead would skip them. The next poll fills
      // them in, and the dedupe keeps this copy from appearing twice.
      setMessages((current) => mergeMessages(current.filter((message) => message.id !== localId), [saved]));
    } catch (error) {
      setMessages((current) =>
        current.map((message) => (message.id === localId ? { ...message, pending: false, failed: true } : message)),
      );
      setToast(error instanceof Error ? error.message : 'Message not sent.');
    } finally {
      setSending(false);
    }
  }

  function onDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    const element = event.target;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 92)}px`;
  }

  const leader = [...plan.venues].sort((a, b) => b.voters.length - a.voters.length)[0] ?? null;
  const goingCount = plan.rsvps.filter((rsvp) => rsvp.status === 'yes').length;
  const players = activity?.crew.filter((member) => member.isMember).length ?? 0;

  // Blocking hides a person's messages immediately; the server filters them on
  // the next poll too, but the already-loaded page must not keep showing them.
  const visibleMessages = messages.filter(
    (message) => !message.authorId || !blockedIds.includes(message.authorId),
  );
  const hasUserMessages = visibleMessages.some((message) => message.kind === 'user');

  const rows: React.ReactNode[] = [];
  let lastDay = '';
  let lastAuthor: string | null = null;

  visibleMessages.forEach((message) => {
    const key = dayKey(message.createdAt);
    if (key !== lastDay) {
      rows.push(
        <div className="day" key={`day-${key}`}>
          <span suppressHydrationWarning>{mounted ? formatDayLabel(message.createdAt) : ''}</span>
        </div>,
      );
      lastDay = key;
      lastAuthor = null;
    }

    if (message.kind === 'system') {
      rows.push(
        <div className="sys" key={message.id}>
          <span>{message.body}</span>
        </div>,
      );
      lastAuthor = null;
      return;
    }

    const mine = message.authorId === me.id;
    const grouped = lastAuthor === message.authorId;
    lastAuthor = message.authorId;

    rows.push(
      <div key={message.id} className={`msg${mine ? ' msg--mine' : ''}${grouped ? ' msg--grouped' : ''}`}>
        {!mine ? (
          <span className="msg__avatar">{grouped ? null : <Avatar name={message.authorName ?? '?'} size={26} />}</span>
        ) : null}
        <div className={`bubble${message.pending ? ' is-pending' : ''}${message.failed ? ' is-failed' : ''}`}>
          {!mine && !grouped ? <span className="bubble__author">{message.authorName}</span> : null}
          <p className="bubble__body">{message.body}</p>
          <span className="bubble__meta">
            {mounted ? formatClock(message.createdAt) : ''}
            {mine && !message.pending && !message.failed ? <Check size={12} /> : null}
          </span>
          {message.failed ? (
            <button
              type="button"
              className="bubble__retry"
              onClick={() => {
                setMessages((current) => current.filter((item) => item.id !== message.id));
                setDraft(message.body);
                inputRef.current?.focus();
              }}
            >
              Not sent · tap to retry
            </button>
          ) : null}
        </div>
      </div>,
    );
  });

  return (
    <div className="screen chat-screen">
      <header className="chat-head">
        <button type="button" className="icon-btn" onClick={() => router.push('/groups')} aria-label="All groups">
          <ChevronLeft size={22} />
        </button>
        <div className="chat-head__id">
          <h1 className="chat-head__name">{group.name}</h1>
          <p className="chat-head__meta">
            <span className={`dot${connection === 'live' ? ' is-live' : ''}`} />
            {members.length} {members.length === 1 ? 'member' : 'members'}
            {plan.eventAt ? ` · ${relativeEvent(plan.eventAt)}` : ''}
            {visibility === 'discoverable' ? ' · open' : ''}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={() => setSheet('plan')} aria-label="Party plan">
          <Calendar size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSheet('members')}
          aria-label="People and invite"
        >
          <Users size={20} />
        </button>
      </header>

      <button type="button" className="plan-strip" onClick={() => setSheet('plan')}>
        <span className="plan-strip__left">
          <span className="plan-strip__icon">
            <Calendar size={16} />
          </span>
          <span className="plan-strip__text">
            <span className="plan-strip__title" suppressHydrationWarning>
              {plan.eventAt ? formatEventChip(plan.eventAt) : 'No date yet'}
            </span>
            <span className="plan-strip__sub">
              {goingCount} going
              {leader ? ` · ${leader.name} leads (${leader.voters.length})` : ' · no venues yet'}
            </span>
          </span>
        </span>
        <span className="plan-strip__cta">{plan.finalizedAt ? 'Locked' : 'Open plan'}</span>
      </button>

      <button type="button" className="goal-strip" onClick={() => setSheet('activity')}>
        <span className="goal-strip__left">
          <span className="goal-strip__icon">
            <Spark size={16} />
          </span>
          <span className="goal-strip__text">
            <span className="goal-strip__title">{activity ? activity.title : 'Start a shared goal'}</span>
            <span className="goal-strip__sub">
              {activity
                ? `${activity.progress} / ${activity.goal} points · ${players} playing`
                : 'Pick a story, pool fictional points, reach the goal'}
            </span>
          </span>
        </span>
        <span className="goal-strip__cta">{activity ? 'Open' : 'Start'}</span>
      </button>

      <div className="messages" ref={listRef} onScroll={handleScroll}>
        {rows}
        {!hasUserMessages ? (
          <div className="chat-empty">
            <Avatar name={group.name} size={44} />
            <h2>You&apos;re in.</h2>
            <p>
              {members.length > 1
                ? `${members.length} people can see this group. Say hello.`
                : 'Nobody else is here yet. Share the invite code to bring someone in.'}
            </p>
            <button type="button" className="btn btn--ghost" onClick={() => setSheet('members')}>
              Invite someone
            </button>
          </div>
        ) : null}
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          ref={inputRef}
          className="composer__input"
          value={draft}
          onChange={onDraftChange}
          placeholder="Message the group"
          rows={1}
          maxLength={1000}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
        />
        <button
          type="submit"
          className="composer__send"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>

      {draft.length > 900 ? <span className="composer__count">{draft.length}/1000</span> : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}

      {sheet === 'plan' ? (
        <PlanSheet
          groupId={group.id}
          meId={me.id}
          plan={plan}
          members={members}
          role={role}
          onPlan={setPlan}
          onClose={() => setSheet(null)}
          onError={setToast}
        />
      ) : null}

      {sheet === 'activity' ? (
        <ActivitySheet
          groupId={group.id}
          meId={me.id}
          role={role}
          members={members}
          initialActivity={activity}
          onActivity={setActivity}
          onClose={() => setSheet(null)}
          onError={setToast}
        />
      ) : null}

      {sheet === 'members' ? (
        <MembersSheet
          groupId={group.id}
          meId={me.id}
          role={role}
          members={members}
          inviteCode={inviteCode}
          visibility={visibility}
          blockedIds={blockedIds}
          onMembers={setMembers}
          onCode={(next) => {
            setInviteCode(next);
            router.refresh();
          }}
          onVisibility={setVisibility}
          onBlockedChange={setBlockedIds}
          onClose={() => setSheet(null)}
          onError={setToast}
          onNotice={setToast}
        />
      ) : null}
    </div>
  );
}
