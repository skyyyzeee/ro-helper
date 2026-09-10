import { usePlatform } from '../platform/PlatformContext';
import { Overlay } from './Overlay';

export function App() {
  const platform = usePlatform();
  // In the browser there is no game behind the window, so the stage paints a stand-in scene.
  const preview = platform.kind === 'browser';
  return (
    <div className={preview ? 'stage stage--preview' : 'stage'}>
      <Overlay />
    </div>
  );
}
