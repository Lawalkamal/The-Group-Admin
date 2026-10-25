import type { RsvpStatus } from './validate';

export type GroupRole = 'admin' | 'member';
export type GroupVisibility = 'invite' | 'discoverable';

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
  visibility: GroupVisibility;
  description: string;
  role: GroupRole;
  memberCount: number;
  memberNames: string[];
  lastMessage: string | null;
  lastAt: string | null;
  eventAt: string | null;
  finalizedAt: string | null;
};

export type ExploreGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  memberNames: string[];
  lastAt: string | null;
  createdAt: string;
  activityTitle: string | null;
};

export type SharedGoalAction = {
  id: string;
  label: string;
  hint: string;
  points: number;
};

export type SharedGoalContribution = {
  id: string;
  userId: string;
  username: string;
  actionId: string;
  actionLabel: string;
  points: number;
  note: string;
  createdAt: string;
};

export type SharedGoalCheer = {
  userId: string;
  username: string;
  actionId: string;
};

export type SharedGoalCrewMember = {
  userId: string;
  username: string;
  points: number;
  moves: number;
  cheerActionId: string | null;
  isMember: boolean;
};

export type SharedGoal = {
  id: string;
  scenario: string;
  title: string;
  blurb: string;
  goal: number;
  status: 'active';
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  progress: number;
  actions: SharedGoalAction[];
  contributions: SharedGoalContribution[];
  cheers: SharedGoalCheer[];
  crew: SharedGoalCrewMember[];
  spotlightActionId: string | null;
};

export type SharedGoalSummary = {
  id: string;
  scenario: string;
  title: string;
  goal: number;
  status: 'complete' | 'closed';
  createdAt: string;
  completedAt: string | null;
  finalProgress: number;
  outcome: string;
  participants: number;
};

export type ActivityState = {
  current: SharedGoal | null;
  history: SharedGoalSummary[];
};

export type ReportReason = 'harassment' | 'spam' | 'hate' | 'other';

export type Report = {
  id: string;
  groupId: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: ReportReason;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type GroupSnapshot = {
  id: string;
  name: string;
  inviteCode: string;
  visibility: GroupVisibility;
  description: string;
  role: GroupRole;
  members: Member[];
  messages: ChatMessage[];
  plan: Plan;
  activity: SharedGoal | null;
  blockedIds: string[];
  lastSeq: number;
};

export type SyncPayload = {
  messages: ChatMessage[];
  plan: Plan;
  members: Member[];
  activity: SharedGoal | null;
  blockedIds: string[];
  role: GroupRole;
  lastSeq: number;
};
