import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountProvider } from '../account/AccountContext';
import { createFakeAccounts, type FakeAccounts } from '../account/fake';
import { SyncProvider } from '../account/SyncContext';
import { SYNC_RULES } from '../ui/syncedSettings';
import { RolesProvider } from '../ui/roles';
import { MemosProvider } from '../ui/memos';
import type { Account } from '../account/types';
import { createFakePlatform, type FakeOptions, type FakePlatform } from '../platform/fake';
import { PlatformProvider } from '../platform/PlatformContext';
import { App } from '../ui/App';
import { SERVER_INFO, loadPack } from '../data';
import { DEFAULT_HOTKEY } from '../ui/overlaySettings';
import { APP_VERSION } from '../ui/about';
import { PROFILE_KEY, type Profile } from '../ui/profile';
import { SEEN_VERSION_KEY } from '../ui/whatsNew';

export interface RenderOptions {
  platform?: FakeOptions;
  /** Saved settings to start with. */
  settings?: Record<string, unknown>;
  /** The saved profile; `null` starts on the first-launch screen. Defaults to Тверской without an organisation. */
  profile?: Partial<Profile> | null;
  /** The player signed in with Discord; nobody by default. */
  account?: Account;
  /** What the server holds before the app starts: admins, players' cards, roles, requests. */
  server?: (server: FakeAccounts['server']) => void;
}

/** Every card pinned over the game, block by block, in the order they were pinned. */
export const pinnedCards = (platform: FakePlatform) => platform.state.pins.flatMap((group) => group.cards);

/** Renders the whole app on a fake platform and waits until it has loaded its settings. */
/**
 * Every server's laws, read before the app starts: the app loads them a moment after its start (or a server
 * switch); here they are there at once, as for a player whose laws were read already, so the tests see the app,
 * not how long a file takes to read.
 */
export const preloadPacks = () => Promise.all(Object.keys(SERVER_INFO).map(loadPack));

export async function renderApp(options: RenderOptions = {}) {
  await preloadPacks();
  const platform = createFakePlatform(options.platform);
  const profile = options.profile === null ? null : { server: 'tverskoi', organization: 'none', hotkey: DEFAULT_HOTKEY, ...options.profile };
  if (profile) platform.settings.set(PROFILE_KEY, profile);
  // A copy that has run this version before: «Что нового» after an update is its own test's to show.
  platform.settings.set(SEEN_VERSION_KEY, APP_VERSION);
  for (const [key, value] of Object.entries(options.settings ?? {})) platform.settings.set(key, value);

  const accounts = createFakeAccounts(options.account);
  options.server?.(accounts.server);
  render(
    <PlatformProvider platform={platform}>
      <AccountProvider accounts={accounts}>
        <SyncProvider accounts={accounts} rules={SYNC_RULES}>
          <RolesProvider accounts={accounts}>
            <MemosProvider>
              <App />
            </MemosProvider>
          </RolesProvider>
        </SyncProvider>
      </AccountProvider>
    </PlatformProvider>,
  );
  if (profile) await screen.findByRole('searchbox', { name: 'Поиск по законам' });
  else await screen.findByRole('heading', { name: 'Выберите сервер' });
  return { platform, accounts, user: userEvent.setup() };
}
