import type { RsvpStatus } from './validate';

export type GroupRole = 'admin' | 'member';

export type Member = {
  id: string;
  username: string;
  role: GroupRole;
  joinedAt: string;
};

export type ChatMessage = {
  seq: number;
  id: string;
  kind: 'user' | 'system';
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
};

export type Venue = {
  id: string;
  name: string;
  note: string;
  proposedBy: string | null;
  proposedByName: string | null;
  voters: string[];
};

export type Rsvp = {
  userId: string;
  username: string;
  status: RsvpStatus;
};

export type Plan = {
  title: string;
  eventAt: string | null;
  locationNote: string;
  budgetNote: string;
  finalizedAt: string | null;
  venues: Venue[];
  rsvps: Rsvp[];
};

export type GroupSummary = {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  memberCount: number;
  memberNames: string[];
  lastMessage: string | null;
  lastAt: string | null;
  eventAt: string | null;
  finalizedAt: string | null;
};

export type GroupSnapshot = {
  id: string;
  name: string;
  inviteCode: string;
  role: GroupRole;
  members: Member[];
  messages: ChatMessage[];
  plan: Plan;
  lastSeq: number;
};

export type SyncPayload = {
  messages: ChatMessage[];
  plan: Plan;
  members: Member[];
  role: GroupRole;
  lastSeq: number;
};
