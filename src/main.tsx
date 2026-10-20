import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './ui/App';
import { AccountProvider } from './account/AccountContext';
import { createSupabaseAccounts } from './account/supabase';
import { SyncProvider } from './account/SyncContext';
import { SYNC_RULES } from './ui/syncedSettings';
import { RolesProvider } from './ui/roles';
import { MemosProvider } from './ui/memos';
import { createBrowserPlatform } from './platform/browser';
import { PlatformProvider } from './platform/PlatformContext';
import { createPinBridge, createQuickBridge, createTauriPlatform, isPinWindow, isQuickWindow, isTauri } from './platform/tauri';
import { installNativeFeel } from './ui/nativeFeel';
import { PinWindow } from './ui/PinSurface';
import { QuickSearch } from './ui/QuickSearch';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  // In the app, every window behaves as an app, not a web page: no browser menu, keys or tooltips.
  if (isTauri()) installNativeFeel();
  // The app has three windows on the same page: the overlay, what is pinned over the game, and the quick search.
  // In the preview, «?quick» shows the quick search's bar on its own, on the preview's settings.
  if (isQuickWindow() || (!isTauri() && new URLSearchParams(location.search).has('quick'))) {
    const preview = createBrowserPlatform();
    root.render(
      <StrictMode>
        <QuickSearch
          bridge={
            isTauri()
              ? createQuickBridge()
              : {
                  readSetting: preview.readSetting,
                  readLaws: async () => undefined,
                  onShown: () => () => {},
                  hide: async () => console.info('quick search: hidden'),
                  request: async (request) => console.info('quick search asks', request),
                  // The preview's own recent articles, to see the list.
                  onState(listener) {
                    void preview.readSetting<{ server: string }>('profile').then(async (profile) =>
                      listener({ charges: [], recent: (await preview.readSetting<string[]>(`recent:${profile?.server ?? 'tverskoi'}`)) ?? [] }),
                    );
                    return () => {};
                  },
                }
          }
        />
      </StrictMode>,
    );
    return;
  }
  if (isPinWindow()) {
    root.render(
      <StrictMode>
        <PinWindow bridge={createPinBridge()} />
      </StrictMode>,
    );
    return;
  }
  const platform = isTauri() ? await createTauriPlatform() : createBrowserPlatform();
  // In the preview nothing listens for the browser coming back: signing in says it works in the app only.
  const accounts = createSupabaseAccounts(platform);
  root.render(
    <StrictMode>
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
      </PlatformProvider>
    </StrictMode>,
  );
}

void start();
