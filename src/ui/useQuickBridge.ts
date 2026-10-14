import { useEffect, useRef, useState } from 'react';
import type { PlatformAdapter, QuickState, QuickTarget } from '../platform/types';
import { forgetHotkey, trackHotkey } from './hotkeys';
import { DEFAULT_QUICK_HOTKEY, QUICK_HOTKEY_KEY } from './overlaySettings';

/** What the bar asks the overlay to do, where the calculator, the recent articles and the AI are. */
export interface QuickActions {
  /** An article into the calculator, by its key (`uk-65#1`); one already in it stays. */
  charge: (key: string) => void;
  /** An article the bar opened, to the recent ones. */
  remember: (key: string) => void;
  clearRecent: () => void;
  clearCharges: () => void;
  /** A question to the AI, with the overlay shown. */
  ask: (question: string) => void;
  /** A part of the assistant, opened by a command of the bar (roadmap 2В), with the overlay shown. */
  open: (to: QuickTarget) => void;
}

export interface QuickBridgeOptions {
  /** A key is being recorded in the settings: none is registered meanwhile. */
  capturing: boolean;
  /** Keys the overlay and the voice already use: the bar's is never one of them. */
  taken: string[];
  /** What the bar shows: the calculator's and the recent articles' keys. */
  state: QuickState;
  actions: QuickActions;
}

export interface QuickBridge {
  quickHotkey: string;
  changeQuickHotkey: (accelerator: string) => void;
}

/**
 * The quick search (ticket 27; roadmap 2А, out of Overlay.tsx): its own key shows its bar over the game, and what the
 * bar asks — an article into the calculator, a question to the AI — is done by the overlay. The bar is told what is in
 * the calculator and the recent articles whenever they change, and when it starts.
 */
export function useQuickBridge(platform: PlatformAdapter, { capturing, taken, state, actions }: QuickBridgeOptions): QuickBridge {
  const [quickHotkey, setQuickHotkey] = useState(DEFAULT_QUICK_HOTKEY);
  useEffect(() => {
    void platform.readSetting<string>(QUICK_HOTKEY_KEY).then((saved) => setQuickHotkey(saved ?? DEFAULT_QUICK_HOTKEY));
  }, [platform]);
  const changeQuickHotkey = (accelerator: string) => {
    setQuickHotkey(accelerator);
    void platform.writeSetting(QUICK_HOTKEY_KEY, accelerator);
  };
  // Not while a key is being recorded, and never on a key the overlay or the voice already use.
  const clash = taken.includes(quickHotkey);
  useEffect(() => {
    if (capturing || !quickHotkey || clash) return;
    trackHotkey(platform, 'quick', quickHotkey, platform.registerQuickHotkey(quickHotkey), 'Быстрый поиск по ней не откроется.');
    return () => {
      forgetHotkey('quick');
      void platform.unregisterQuickHotkey();
    };
  }, [platform, quickHotkey, capturing, clash]);

  // The bar's requests are answered with what the overlay has now.
  const now = useRef({ state, actions });
  now.current = { state, actions };
  useEffect(
    () =>
      platform.onQuickRequest((request) => {
        const { state, actions } = now.current;
        switch (request.kind) {
          case 'charge':
            return actions.charge(request.key);
          case 'remember':
            return actions.remember(request.key);
          case 'clear-recent':
            return actions.clearRecent();
          case 'clear-charges':
            return actions.clearCharges();
          case 'open-calculator':
            void platform.showOverlay();
            window.setTimeout(() => document.querySelector<HTMLElement>('.calc button, .calc input')?.focus(), 100);
            return;
          case 'ask':
            void platform.showOverlay();
            return actions.ask(request.question);
          case 'open':
            void platform.showOverlay();
            return actions.open(request.to);
          case 'hello':
            void platform.sendQuickState(state);
            return;
        }
      }),
    [platform],
  );
  const shown = JSON.stringify(state);
  useEffect(() => {
    void platform.sendQuickState(JSON.parse(shown));
  }, [platform, shown]);

  return { quickHotkey, changeQuickHotkey };
}
