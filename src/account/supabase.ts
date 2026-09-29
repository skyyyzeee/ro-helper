import { createClient, type SupportedStorage, type User } from '@supabase/supabase-js';
import type { PlatformAdapter } from '../platform/types';
import { ACCOUNT_KEY, SignInError, type Account, type Accounts, type Provider } from './types';

/** The helper's Supabase project. The publishable key is meant for the app itself: the database's rules guard the data. */
export const SUPABASE_URL = 'https://evwyrdytojwxlvgqrkar.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_MjdXihRRpYCnP-ZFZPczkw_mi2nv_Q5';
/** The edge function behind signing in with Telegram (supabase/functions/telegram-login). */
const TELEGRAM_FUNCTION = 'telegram-login';

/** What the account says of the player, signed in with `via`. */
export function accountOf(user: User, via: Provider): Account {
  const meta = user.user_metadata ?? {};
  const name = meta.custom_claims?.global_name ?? meta.full_name ?? meta.name ?? meta.user_name ?? meta.telegram_name ?? 'Игрок';
  const telegram = meta.telegram_username ? `@${meta.telegram_username}` : meta.telegram_name;
  return {
    id: user.id,
    name,
    via,
    ...(meta.avatar_url ? { avatar: meta.avatar_url } : {}),
    ...(telegram ? { telegram } : {}),
  };
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (text: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

export interface SupabaseAccountsOptions {
  /** How often to ask whether the player pressed «Start» in Telegram. */
  pollMs?: number;
  /** How long to wait for it (the function forgets a sign-in after 10 minutes too). */
  lifetimeMs?: number;
}

type Claimed = { status: 'signed-in'; token_hash: string } | { status: 'linked'; name: string; username: string | null } | { status: 'taken' | 'unauthorized' | 'failed' };

/**
 * Accounts on Supabase.
 * - Discord, in the player's own browser, which comes back to a one-off listener of the app on this computer
 *   with a code, traded here for a session (PKCE: the code is worthless without the secret this app keeps).
 * - Telegram, with the helper's bot: the app opens it with the hash of a secret it keeps; once the player
 *   presses «Start», the edge function knows who they are and gives the sign-in to whoever has the secret.
 * The session lives in the app's settings.
 */
export function createSupabaseAccounts(platform: PlatformAdapter, options: SupabaseAccountsOptions = {}): Accounts {
  const pollMs = options.pollMs ?? 2000;
  const lifetimeMs = options.lifetimeMs ?? 10 * 60 * 1000;
  const storage: SupportedStorage = {
    getItem: async (key) => (await platform.readSetting<string>(`auth:${key}`)) ?? null,
    setItem: (key, value) => platform.writeSetting(`auth:${key}`, value),
    removeItem: (key) => platform.writeSetting(`auth:${key}`, null),
  };
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  /** The Telegram sign-in under way, to give it up. */
  let waiting: AbortController | null = null;

  const remember = async (account: Account) => {
    await platform.writeSetting(ACCOUNT_KEY, account);
    return account;
  };

  const signInWithDiscord = async () => {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: platform.signInRedirect, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw new SignInError('failed', error?.message);
    const back = new URLSearchParams(
      await platform.signInInBrowser(data.url).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        throw new SignInError(message === 'cancelled' || message === 'unsupported' ? message : 'failed', message);
      }),
    );
    const code = back.get('code');
    if (!code) throw new SignInError('failed', back.get('error_description') ?? back.get('error') ?? undefined);
    const exchanged = await client.auth.exchangeCodeForSession(code);
    if (exchanged.error) throw new SignInError('failed', exchanged.error.message);
    return remember(accountOf(exchanged.data.user, 'discord'));
  };

  /** Opens the bot with the hash of a new secret and waits until the function has the player under it. */
  const throughTelegram = async (link: boolean): Promise<Claimed> => {
    const bot = await client.functions.invoke<{ username?: string }>(TELEGRAM_FUNCTION, { body: { action: 'bot' } });
    if (bot.error || !bot.data?.username) throw new SignInError('failed', bot.error?.message ?? 'no bot');
    const secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const cancel = new AbortController();
    waiting?.abort();
    waiting = cancel;
    try {
      await platform.openExternal(`https://t.me/${bot.data.username}?start=${await sha256(secret)}`);
      const deadline = Date.now() + lifetimeMs;
      for (;;) {
        // A pause between the questions, cut short by «Отмена».
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, pollMs);
          cancel.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (cancel.signal.aborted) throw new SignInError('cancelled');
        if (Date.now() > deadline) throw new SignInError('expired');
        const { data, error } = await client.functions.invoke<Claimed | { status: 'waiting' }>(TELEGRAM_FUNCTION, {
          body: { action: 'claim', secret, link },
        });
        // A moment without the internet: ask again.
        if (error || !data || data.status === 'waiting') continue;
        if (cancel.signal.aborted) throw new SignInError('cancelled');
        return data;
      }
    } finally {
      if (waiting === cancel) waiting = null;
    }
  };

  const signInWithTelegram = async () => {
    const claimed = await throughTelegram(false);
    if (claimed.status !== 'signed-in') throw new SignInError('failed', claimed.status);
    const verified = await client.auth.verifyOtp({ token_hash: claimed.token_hash, type: 'email' });
    if (verified.error || !verified.data.user) throw new SignInError('failed', verified.error?.message);
    return remember(accountOf(verified.data.user, 'telegram'));
  };

  return {
    settings: {
      async pull(since) {
        let query = client.from('user_settings').select('key,value,updated_at');
        if (since) query = query.gt('updated_at', since);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
      },
      async push(rows) {
        const { data } = await client.auth.getSession();
        const user = data.session?.user.id;
        if (!user) throw new Error('signed out');
        const { error } = await client.from('user_settings').upsert(
          rows.map((row) => ({ user_id: user, ...row })),
          { onConflict: 'user_id,key' },
        );
        if (error) throw new Error(error.message);
      },
    },

    async sendUsage(counts) {
      const { error } = await client.rpc('count_usage', { counts });
      if (error) throw new Error(error.message);
    },

    current: async () => (await platform.readSetting<Account | null>(ACCOUNT_KEY)) ?? null,

    signIn: (provider) => (provider === 'telegram' ? signInWithTelegram() : signInWithDiscord()),

    async linkTelegram() {
      const account = await platform.readSetting<Account | null>(ACCOUNT_KEY);
      if (!account) throw new SignInError('failed', 'not signed in');
      const claimed = await throughTelegram(true);
      if (claimed.status === 'taken') throw new SignInError('taken');
      if (claimed.status !== 'linked') throw new SignInError('failed', claimed.status);
      return remember({ ...account, telegram: claimed.username ? `@${claimed.username}` : claimed.name });
    },

    cancelSignIn() {
      waiting?.abort();
      void platform.cancelSignIn();
    },

    async signOut() {
      // Signed out on this computer even offline: the session is forgotten here whatever the server says.
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await platform.writeSetting(ACCOUNT_KEY, null);
    },
  };
}
