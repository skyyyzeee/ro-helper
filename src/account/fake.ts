import type { RemoteSetting } from './sync';
import { SignInError, type Account, type Accounts, type UsageCount } from './types';

export interface FakeAccounts extends Accounts {
  /** The sign-in or the joining under way ends: signed in as this player, or failed for this reason. */
  finishSignIn(result: Account | SignInError['reason']): void;
  /** «signIn:discord», «linkTelegram», «signOut»… in order. */
  readonly calls: string[];
  /** The account's settings, by key. */
  readonly table: Map<string, RemoteSetting>;
  /** The anonymous counts sent, call by call. */
  readonly usage: UsageCount[][];
}

/** Accounts in memory, for tests: a sign-in waits until `finishSignIn`. */
export function createFakeAccounts(signedIn: Account | null = null): FakeAccounts {
  let account = signedIn;
  let waiting: { resolve: (account: Account) => void; reject: (error: SignInError) => void } | null = null;
  const calls: string[] = [];
  const table = new Map<string, RemoteSetting>();
  const usage: UsageCount[][] = [];
  const wait = () =>
    new Promise<Account>((resolve, reject) => {
      waiting = { resolve, reject };
    });
  return {
    calls,
    table,
    usage,
    sendUsage: async (counts) => {
      usage.push(counts);
    },
    settings: {
      pull: async (since) => [...table.values()].filter((row) => !since || row.updated_at > since),
      push: async (rows) => {
        for (const row of rows) if (!table.has(row.key) || table.get(row.key)!.updated_at <= row.updated_at) table.set(row.key, row);
      },
    },
    current: async () => account,
    signIn(provider) {
      calls.push(`signIn:${provider}`);
      return wait();
    },
    linkTelegram() {
      calls.push('linkTelegram');
      return wait();
    },
    cancelSignIn() {
      calls.push('cancelSignIn');
      waiting?.reject(new SignInError('cancelled'));
      waiting = null;
    },
    async signOut() {
      calls.push('signOut');
      account = null;
    },
    finishSignIn(result) {
      if (typeof result === 'string') waiting?.reject(new SignInError(result));
      else {
        account = result;
        waiting?.resolve(result);
      }
      waiting = null;
    },
  };
}
