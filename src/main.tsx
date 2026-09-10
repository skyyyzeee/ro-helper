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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlatformProvider platform={createBrowserPlatform()}>
      <App />
    </PlatformProvider>
  </StrictMode>,
);
