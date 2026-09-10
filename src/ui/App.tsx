import { useEffect } from 'react';
import { TVERSKOI_PACK } from '../data';
import { usePlatform } from '../platform/PlatformContext';
import { Overlay } from './Overlay';
import { DEFAULT_HOTKEY } from './overlaySettings';

export function App() {
  const platform = usePlatform();
  // In the browser there is no game behind the window, so the stage paints a stand-in scene.
  const preview = platform.kind === 'browser';

  useEffect(() => {
    void platform.registerHotkey(DEFAULT_HOTKEY, () => void platform.toggleOverlay());
    return () => void platform.unregisterHotkey();
  }, [platform]);

  return (
    <div className={preview ? 'stage stage--preview' : 'stage'}>
      <Overlay pack={TVERSKOI_PACK} />
    </div>
  );
}
