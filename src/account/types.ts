import type { SyncBackend } from './sync';

/** How a player signs in. */
export type Provider = 'discord' | 'telegram';

/** The player signed in on this computer. */
export interface Account {
  id: string;
  /** Their Discord name, or their name in Telegram. */
  name: string;
  /** Their Discord avatar, if they have one (Telegram's can't be shown without the bot's key). */
  avatar?: string;
  /** What they signed in with; older saved accounts have none: Discord. */
  via?: Provider;
  /** The Telegram joined to the account, as «@username» or a name. */
  telegram?: string;
}

/** The signed-in player, kept in the settings: known at the next start without the internet. */
export const ACCOUNT_KEY = 'account';

/** Why a sign-in ended without an account. */
export class SignInError extends Error {
  constructor(
    /** «taken»: this Telegram already belongs to another account; «expired»: nobody pressed «Start» in time. */
    readonly reason: 'cancelled' | 'unsupported' | 'failed' | 'taken' | 'expired',
    message?: string,
  ) {
    super(message ?? reason);
  }
}

/**
 * Accounts (2.1): signing in with Discord or Telegram is optional for now; without it the helper works as
 * before. Behind this interface so the UI and its tests never touch Supabase.
 */
export interface Accounts {
  /** The signed-in player, or nobody. Needs no internet once signed in. */
  current(): Promise<Account | null>;
  /**
   * Discord: opens it in the browser and waits until the player comes back signed in. Telegram: opens the
   * bot and waits until the player presses «Start» there. Throws a `SignInError`.
   */
  signIn(provider: Provider): Promise<Account>;
  /** Joins the player's Telegram to the account they are signed in to, the same way. */
  linkTelegram(): Promise<Account>;
  /** Gives up the sign-in or the joining under way: it then throws «cancelled». */
  cancelSignIn(): void;
  signOut(): Promise<void>;
  /** The signed-in player's settings in the account, synced with this computer's. */
  readonly settings: SyncBackend;
  /** Adds anonymous counts to the author's (signed in or not). Throws when offline. */
  sendUsage(counts: UsageCount[]): Promise<void>;
}

/** A count for the author: a day, a server, what was done, how many times. Nothing of the player. */
export interface UsageCount {
  day: string;
  server: string;
  event: string;
  count: number;
}
