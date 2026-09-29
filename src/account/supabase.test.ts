import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import { createSupabaseAccounts } from './supabase';
import { ACCOUNT_KEY, SignInError } from './types';

const auth = {
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
const functions = { invoke: vi.fn() };
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth, functions }) }));

const DISCORD_PAGE = 'https://evwyrdytojwxlvgqrkar.supabase.co/auth/v1/authorize?provider=discord';
const user = {
  id: 'user-1',
  user_metadata: { full_name: 'skyze', avatar_url: 'https://cdn.discordapp.com/avatars/1/a.png', custom_claims: { global_name: 'Skyze' } },
};

beforeEach(() => {
  vi.resetAllMocks();
  auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'discord', url: DISCORD_PAGE }, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

/** Starts a sign-in and waits until the browser has been sent to Discord. */
async function startSignIn() {
  const platform = createFakePlatform();
  const accounts = createSupabaseAccounts(platform);
  const signingIn = accounts.signIn('discord');
  await vi.waitFor(() => expect(platform.calls.some((c) => c.method === 'signInInBrowser')).toBe(true));
  return { platform, accounts, signingIn };
}

describe('accounts on Supabase', () => {
  it('signs in with Discord in the browser and remembers the player for the next start, offline', async () => {
    const { platform, signingIn } = await startSignIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'discord',
      options: { redirectTo: 'http://127.0.0.1:47321/auth/callback', skipBrowserRedirect: true },
    });
    expect(platform.calls.find((c) => c.method === 'signInInBrowser')?.args).toEqual([DISCORD_PAGE]);

    platform.comeBackFromSignIn('code=abc-123');
    const account = { id: 'user-1', name: 'Skyze', via: 'discord', avatar: 'https://cdn.discordapp.com/avatars/1/a.png' };
    await expect(signingIn).resolves.toEqual(account);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc-123');
    expect(platform.settings.get(ACCOUNT_KEY)).toEqual(account);

    // The next start knows the player without asking the server.
    auth.exchangeCodeForSession.mockClear();
    await expect(createSupabaseAccounts(platform).current()).resolves.toEqual(account);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails when the player refuses on Discord', async () => {
    const { platform, signingIn } = await startSignIn();
    platform.comeBackFromSignIn('error=access_denied&error_description=The+resource+owner+denied+the+request');
    await expect(signingIn).rejects.toMatchObject({ reason: 'failed', message: 'The resource owner denied the request' });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(platform.settings.get(ACCOUNT_KEY)).toBeUndefined();
  });

  it('gives up when cancelled', async () => {
    const { accounts, signingIn } = await startSignIn();
    accounts.cancelSignIn();
    await expect(signingIn).rejects.toEqual(new SignInError('cancelled'));
  });

  it('signs out on this computer even when the server cannot be reached', async () => {
    const { platform, accounts, signingIn } = await startSignIn();
    platform.comeBackFromSignIn('code=abc-123');
    await signingIn;
    auth.signOut.mockRejectedValue(new Error('offline'));
    await accounts.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await expect(accounts.current()).resolves.toBeNull();
  });

  describe('with Telegram', () => {
    /** The function: the bot's name, then «waiting» until the player presses «Start», then `claimed`. */
    const functionAnswers = (claimed: object, waits = 1) => {
      let asked = 0;
      functions.invoke.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => {
        if (body.action === 'bot') return { data: { username: 'ro_helper_bot' }, error: null };
        asked += 1;
        return { data: asked <= waits ? { status: 'waiting' } : claimed, error: null };
      });
    };
    const botLink = (platform: ReturnType<typeof createFakePlatform>) =>
      platform.calls.find((c) => c.method === 'openExternal')?.args[0] as string | undefined;

    it('opens the bot with the hash of a secret, and signs in once the player pressed «Start»', async () => {
      functionAnswers({ status: 'signed-in', token_hash: 'hash-1' });
      const telegramUser = { id: 'user-2', user_metadata: { full_name: 'Иван', telegram_id: 42, telegram_name: 'Иван', telegram_username: 'ivan' } };
      auth.verifyOtp.mockResolvedValue({ data: { user: telegramUser, session: {} }, error: null });
      const platform = createFakePlatform();
      const account = await createSupabaseAccounts(platform, { pollMs: 1 }).signIn('telegram');

      expect(botLink(platform)).toMatch(/^https:\/\/t\.me\/ro_helper_bot\?start=[A-Za-z0-9_-]{43}$/);
      const claims = functions.invoke.mock.calls.map(([, { body }]) => body).filter((body) => body.action === 'claim');
      expect(claims).toHaveLength(2);
      // What the link carries is not what is claimed with: only this app knows the secret.
      const [{ secret }] = claims;
      expect(botLink(platform)).not.toContain(secret);
      expect(claims.every((body) => body.secret === secret && body.link === false)).toBe(true);
      expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' });
      expect(account).toEqual({ id: 'user-2', name: 'Иван', via: 'telegram', telegram: '@ivan' });
      expect(platform.settings.get(ACCOUNT_KEY)).toEqual(account);
    });

    it('joins Telegram to the account signed in with Discord', async () => {
      const discord = { id: 'user-1', name: 'Skyze', via: 'discord' };
      const platform = createFakePlatform();
      platform.settings.set(ACCOUNT_KEY, discord);
      functionAnswers({ status: 'linked', name: 'Иван', username: 'ivan' }, 0);
      const account = await createSupabaseAccounts(platform, { pollMs: 1 }).linkTelegram();
      expect(functions.invoke.mock.calls.at(-1)?.[1].body).toMatchObject({ action: 'claim', link: true });
      expect(account).toEqual({ ...discord, telegram: '@ivan' });
      expect(platform.settings.get(ACCOUNT_KEY)).toEqual(account);
    });

    it('says when this Telegram already belongs to another account', async () => {
      const platform = createFakePlatform();
      platform.settings.set(ACCOUNT_KEY, { id: 'user-1', name: 'Skyze', via: 'discord' });
      functionAnswers({ status: 'taken' }, 0);
      await expect(createSupabaseAccounts(platform, { pollMs: 1 }).linkTelegram()).rejects.toMatchObject({ reason: 'taken' });
      expect(platform.settings.get(ACCOUNT_KEY)).not.toHaveProperty('telegram');
    });

    it('gives up when cancelled, or when nobody pressed «Start» in time', async () => {
      functionAnswers({ status: 'signed-in', token_hash: 'hash-1' }, Infinity);
      const accounts = createSupabaseAccounts(createFakePlatform(), { pollMs: 5 });
      const signingIn = accounts.signIn('telegram');
      await vi.waitFor(() => expect(functions.invoke.mock.calls.length).toBeGreaterThan(1));
      accounts.cancelSignIn();
      await expect(signingIn).rejects.toMatchObject({ reason: 'cancelled' });

      await expect(createSupabaseAccounts(createFakePlatform(), { pollMs: 1, lifetimeMs: 20 }).signIn('telegram')).rejects.toMatchObject({
        reason: 'expired',
      });
      expect(auth.verifyOtp).not.toHaveBeenCalled();
    });
  });
});
