import type { ChatMessage } from './types';

export type LocalMessage = ChatMessage & { pending?: boolean; failed?: boolean };

/**
 * Merges polled messages into the local list, keyed by id so a message that
 * arrives twice is shown once, and optimistic sends are replaced by the
 * server's copy.
 */
export function mergeMessages(current: LocalMessage[], incoming: ChatMessage[]): LocalMessage[] {
  const byId = new Map<string, LocalMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, { ...message, pending: false, failed: false });

  return [...byId.values()].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
