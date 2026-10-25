export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const bad = <T>(error: string): Checked<T> => ({ ok: false, error });

export function squash(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function checkUsername(raw: unknown): Checked<string> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < 3 || value.length > 20) {
    return bad('Username must be 3–20 characters.');
  }
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    return bad('Use letters, numbers and underscores only.');
  }
  if (/^[0-9]+$/.test(value)) {
    return bad('Add a letter so the name is readable.');
  }
  return ok(value);
}

export function checkPassword(raw: unknown): Checked<string> {
  const value = typeof raw === 'string' ? raw : '';
  if (value.length < 8) return bad('Password must be at least 8 characters.');
  if (value.length > 200) return bad('Password must be 200 characters or fewer.');
  return ok(value);
}

export function checkGroupName(raw: unknown): Checked<string> {
  const value = squash(raw);
  if (value.length < 2) return bad('Give the group a name (at least 2 characters).');
  if (value.length > 60) return bad('Group names stop at 60 characters.');
  return ok(value);
}

export function checkMessageBody(raw: unknown): Checked<string> {
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (value.length === 0) return bad('Write something first.');
  if (value.length > 1000) return bad('Messages stop at 1000 characters.');
  return ok(value);
}

export function checkVenueName(raw: unknown): Checked<string> {
  const value = squash(raw);
  if (value.length < 2) return bad('Venue needs a name.');
  if (value.length > 80) return bad('Venue names stop at 80 characters.');
  return ok(value);
}

export function checkVenueNote(raw: unknown): Checked<string> {
  const value = squash(raw);
  if (value.length > 160) return bad('Note stops at 160 characters.');
  return ok(value);
}

export function checkFreeText(raw: unknown, max: number, label: string): Checked<string> {
  const value = squash(raw);
  if (value.length > max) return bad(`${label} stops at ${max} characters.`);
  return ok(value);
}

/** Accepts an ISO date string or YYYY-MM-DD from a date input. */
export function checkEventDate(raw: unknown): Checked<string | null> {
  if (raw === null || raw === '' || raw === undefined) return ok(null);
  if (typeof raw !== 'string') return bad('Pick a valid date.');
  const parsed = new Date(raw.length === 10 ? `${raw}T18:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return bad('Pick a valid date.');
  const year = parsed.getUTCFullYear();
  if (year < 2020 || year > 2100) return bad('Pick a date this century, please.');
  return ok(parsed.toISOString());
}

export function checkInviteCode(raw: unknown): Checked<string> {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (value.length < 4 || value.length > 16) return bad('That invite code does not look right.');
  return ok(value);
}

export const GROUP_VISIBILITIES = ['invite', 'discoverable'] as const;
export type GroupVisibilityValue = (typeof GROUP_VISIBILITIES)[number];

export function checkVisibility(raw: unknown): Checked<GroupVisibilityValue> {
  if (typeof raw === 'string' && (GROUP_VISIBILITIES as readonly string[]).includes(raw)) {
    return ok(raw as GroupVisibilityValue);
  }
  return bad('Choose invite-only or discoverable.');
}

export function checkGroupDescription(raw: unknown): Checked<string> {
  const value = squash(raw);
  if (value.length > 140) return bad('Descriptions stop at 140 characters.');
  return ok(value);
}

export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'other', label: 'Something else' },
] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number]['value'];

export function checkReportReason(raw: unknown): Checked<ReportReasonValue> {
  if (typeof raw === 'string' && REPORT_REASONS.some((reason) => reason.value === raw)) {
    return ok(raw as ReportReasonValue);
  }
  return bad('Pick a reason for the report.');
}

export function checkActivityGoal(raw: unknown): Checked<number> {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 50 || value > 500) {
    return bad('Pick a goal between 50 and 500 points.');
  }
  return ok(value);
}

export function checkActivityNote(raw: unknown): Checked<string> {
  const value = squash(raw);
  if (value.length > 140) return bad('Notes stop at 140 characters.');
  return ok(value);
}

export const RSVP_STATUSES = ['yes', 'maybe', 'no'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export function checkRsvp(raw: unknown): Checked<RsvpStatus> {
  if (typeof raw === 'string' && (RSVP_STATUSES as readonly string[]).includes(raw)) {
    return ok(raw as RsvpStatus);
  }
  return bad('Choose yes, maybe or no.');
}
