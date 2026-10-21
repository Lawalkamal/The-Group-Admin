import { randomInt, randomUUID } from 'node:crypto';

// No O/0/I/1 — codes get read aloud and typed.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

export function newId(): string {
  return randomUUID();
}

export function generateInviteCode(): string {
  let code = '';
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

export const INVITE_ALPHABET_PATTERN = `[${INVITE_ALPHABET}]`;
