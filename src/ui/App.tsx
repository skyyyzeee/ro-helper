import { useCallback, useEffect, useState } from 'react';
import { packFor } from '../data';
import { usePlatform } from '../platform/PlatformContext';
import { Onboarding } from './Onboarding';
import { Overlay } from './Overlay';
import { DEFAULT_HOTKEY } from './overlaySettings';
import { PROFILE_KEY, type Profile } from './profile';

const FIRST_PROFILE: Profile = { server: 'tverskoi', organization: 'none', hotkey: DEFAULT_HOTKEY };

export function App() {
  const platform = usePlatform();
  // In the browser there is no game behind the window, so the stage paints a stand-in scene.
  const preview = platform.kind === 'browser';
  /** undefined while loading, null before the first launch is done. */
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void platform.readSetting<Profile>(PROFILE_KEY).then((saved) => setProfile(saved ?? null));
  }, [platform]);

  // The hotkey follows the profile at once; while a new one is being recorded, none is registered.
  const hotkey = profile?.hotkey ?? DEFAULT_HOTKEY;
  useEffect(() => {
    if (capturing) return;
    void platform.registerHotkey(hotkey, () => void platform.toggleOverlay());
    return () => void platform.unregisterHotkey();
  }, [platform, hotkey, capturing]);

  const save = useCallback(
    (next: Profile) => {
      setProfile(next);
      setEditing(false);
      void platform.writeSetting(PROFILE_KEY, next);
    },
    [platform],
  );

  let screen = null;
  if (profile === null) {
    screen = <Onboarding initial={FIRST_PROFILE} mode="first" onDone={save} onCapturing={setCapturing} />;
  } else if (profile && editing) {
    screen = (
      <Onboarding
        initial={profile}
        mode="settings"
        onDone={save}
        onCancel={() => setEditing(false)}
        onCapturing={setCapturing}
      />
    );
  } else if (profile) {
    screen = <Overlay pack={packFor(profile?.server ?? FIRST_PROFILE.server)} profile={profile} onEditProfile={() => setEditing(true)} onProfile={save} />;
  }

  return <div className={preview ? 'stage stage--preview' : 'stage'}>{screen}</div>;
}
