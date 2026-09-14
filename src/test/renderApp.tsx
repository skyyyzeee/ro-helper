import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakePlatform, type FakeOptions, type FakePlatform } from '../platform/fake';
import { PlatformProvider } from '../platform/PlatformContext';
import { App } from '../ui/App';
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
}

/** Every card pinned over the game, block by block, in the order they were pinned. */
export const pinnedCards = (platform: FakePlatform) => platform.state.pins.flatMap((group) => group.cards);

/** Renders the whole app on a fake platform and waits until it has loaded its settings. */
export async function renderApp(options: RenderOptions = {}) {
  const platform = createFakePlatform(options.platform);
  const profile = options.profile === null ? null : { server: 'tverskoi', organization: 'none', hotkey: DEFAULT_HOTKEY, ...options.profile };
  if (profile) platform.settings.set(PROFILE_KEY, profile);
  // A copy that has run this version before: «Что нового» after an update is its own test's to show.
  platform.settings.set(SEEN_VERSION_KEY, APP_VERSION);
  for (const [key, value] of Object.entries(options.settings ?? {})) platform.settings.set(key, value);

  render(
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>,
  );
  if (profile) await screen.findByRole('searchbox', { name: 'Поиск по законам' });
  else await screen.findByRole('heading', { name: 'Выберите сервер' });
  return { platform, user: userEvent.setup() };
}
