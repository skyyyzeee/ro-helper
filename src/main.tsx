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
import { createTauriPlatform, isTauri } from './platform/tauri';

async function start() {
  const platform = isTauri() ? await createTauriPlatform() : createBrowserPlatform();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PlatformProvider platform={platform}>
        <App />
      </PlatformProvider>
    </StrictMode>,
  );
}

void start();
