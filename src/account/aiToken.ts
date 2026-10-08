// The signed-in player's token for the AI server, from wherever the app is: the accounts are set once at its start
// (AccountProvider), the AI is reached from many places (the chat, the trainer, the documents) — none of them need to
// carry the accounts along. No accounts set (tests, no sign-in) — no token: the AI server counts the computer.
import type { Accounts } from './types';

let source: Accounts['aiToken'] | null = null;

export function setAiTokenSource(next: Accounts['aiToken'] | null): void {
  source = next;
}

/** The token, or null — never throws: a sign-in that fails to give one leaves the question asked as before. */
export async function aiToken(): Promise<string | null> {
  try {
    return (await source?.()) ?? null;
  } catch {
    return null;
  }
}
