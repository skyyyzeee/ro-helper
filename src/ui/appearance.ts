import { useCallback, useEffect, useState } from 'react';
import type { PlatformAdapter } from '../platform/types';

/**
 * The look of the app: a theme (the glass and the surfaces) and an accent hue. The accent follows the player's
 * organisation unless they chose one. Both windows — the overlay and the pinned cards — apply the same.
 */

export const THEME_KEY = 'appearance.theme';
export const ACCENT_KEY = 'appearance.accent';
export const SCALE_KEY = 'appearance.scale';
/** The blur behind the glass, on unless turned off: the heaviest thing the app draws over a game. */
export const BLUR_KEY = 'appearance.blur';

/** How big the overlay's text and controls are, for 2K and 4K screens; the cards over the game keep theirs. */
export const SCALES = [0.9, 1, 1.15, 1.3];
export const isScale = (value: unknown): value is number => SCALES.includes(value as number);

/** The overlay's size: its window zoomed as a whole, so every block keeps its proportions. */
export function applyScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('zoom', scale === 1 ? '' : String(scale));
}

export type Theme = 'glass' | 'dense' | 'minimal';
/** The organisation's hue, or a hue the player chose. */
export type Accent = 'organization' | number;

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'glass', label: 'Стекло' },
  { id: 'dense', label: 'Плотная' },
  { id: 'minimal', label: 'Минимализм' },
];

/** Hues to choose from by hand: blue, green, violet, yellow, red, teal, pink. */
export const ACCENT_HUES = [245, 150, 290, 85, 25, 200, 330];

/** The blue of the approved mockup: the accent of a player without an organisation. */
export const DEFAULT_HUE = 245;

/** Each organisation's hue (oklch), the same on every server. */
const ORGANIZATION_HUES: Record<string, number> = {
  mvd: 245,
  gibdd: 85,
  fsb: 290,
  fso: 25,
  army: 145,
  sk: 200,
  prosecutor: 55,
  court: 320,
  government: 15,
  duma: 270,
  hospital: 350,
  news: 65,
  media: 65,
  advocate: 180,
  opg: 5,
  none: DEFAULT_HUE,
};

export const organizationHue = (organization: string): number => ORGANIZATION_HUES[organization] ?? DEFAULT_HUE;

export function accentHue(accent: Accent, organization: string): number {
  return accent === 'organization' ? organizationHue(organization) : accent;
}

export const isTheme = (value: unknown): value is Theme => THEMES.some((t) => t.id === value);
export const isAccent = (value: unknown): value is Accent =>
  value === 'organization' || (typeof value === 'number' && Number.isFinite(value));

/**
 * Puts the theme and the accent on the page: `data-theme` on the root, and the `--accent-hue` token — and
 * `data-blur="off"` when the blur behind the glass is turned off (tokens.css).
 */
export function applyAppearance(theme: Theme, hue: number, blur = true, root: HTMLElement = document.documentElement): void {
  if (theme === 'glass') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.style.setProperty('--accent-hue', String(hue));
  if (blur) delete root.dataset.blur;
  else root.dataset.blur = 'off';
}

/** The look as the settings show and change it. */
export interface AppearanceControl {
  theme: Theme;
  accent: Accent;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  scale: number;
  setScale: (scale: number) => void;
  blur: boolean;
  setBlur: (on: boolean) => void;
}

/**
 * The saved theme and accent, applied to the page at once and again whenever the organisation changes
 * (a faction accent follows it). Until the settings are read the page keeps the default look.
 */
export function useAppearance(platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting' | 'setPinLook'>, organization: string): AppearanceControl {
  const [theme, setThemeState] = useState<Theme>('glass');
  const [accent, setAccentState] = useState<Accent>('organization');
  const [scale, setScaleState] = useState(1);
  const [blur, setBlurState] = useState(true);

  useEffect(() => {
    void Promise.all([
      platform.readSetting<unknown>(THEME_KEY),
      platform.readSetting<unknown>(ACCENT_KEY),
      platform.readSetting<unknown>(SCALE_KEY),
      platform.readSetting<unknown>(BLUR_KEY),
    ]).then(([savedTheme, savedAccent, savedScale, savedBlur]) => {
      if (isTheme(savedTheme)) setThemeState(savedTheme);
      if (isAccent(savedAccent)) setAccentState(savedAccent);
      if (isScale(savedScale)) setScaleState(savedScale);
      if (savedBlur === false) setBlurState(false);
    });
  }, [platform]);

  // The page, and the pinned cards in their own window.
  useEffect(() => {
    const hue = accentHue(accent, organization);
    applyAppearance(theme, hue, blur);
    void platform.setPinLook({ theme, hue, blur });
  }, [platform, theme, accent, organization, blur]);
  useEffect(() => applyScale(scale), [scale]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      void platform.writeSetting(THEME_KEY, next);
    },
    [platform],
  );
  const setAccent = useCallback(
    (next: Accent) => {
      setAccentState(next);
      void platform.writeSetting(ACCENT_KEY, next);
    },
    [platform],
  );
  const setScale = useCallback(
    (next: number) => {
      setScaleState(next);
      void platform.writeSetting(SCALE_KEY, next);
    },
    [platform],
  );
  const setBlur = useCallback(
    (on: boolean) => {
      setBlurState(on);
      void platform.writeSetting(BLUR_KEY, on);
    },
    [platform],
  );
  return { theme, accent, setTheme, setAccent, scale, setScale, blur, setBlur };
}
