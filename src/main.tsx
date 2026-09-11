import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './ui/App';
import { createBrowserPlatform } from './platform/browser';
import { PlatformProvider } from './platform/PlatformContext';
import { createPinBridge, createTauriPlatform, isPinWindow, isTauri } from './platform/tauri';
import { PinWindow } from './ui/PinCardView';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  // The app has two windows on the same page: the overlay, and the card pinned over the game.
  if (isPinWindow()) {
    root.render(
      <StrictMode>
        <PinWindow bridge={createPinBridge()} />
      </StrictMode>,
    );
    return;
  }
  const platform = isTauri() ? await createTauriPlatform() : createBrowserPlatform();
  root.render(
    <StrictMode>
      <PlatformProvider platform={platform}>
        <App />
      </PlatformProvider>
    </StrictMode>,
  );
}

void start();
