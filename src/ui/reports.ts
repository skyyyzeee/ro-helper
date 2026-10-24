import { useEffect, useState } from 'react';
import { usePlatform } from '../platform/PlatformContext';
import type { PlatformAdapter } from '../platform/types';
import { APP_VERSION } from './about';
import { aiServerOf, deviceOf } from './ai';

/**
 * Reports of the app's own errors (skyze: automatic, the box ticked when the player signs in): what broke and
 * where — the version, Windows, the part of the app, the message and where in the code. Nothing the player typed,
 * searched or asked, no screenshots. On unless turned off in the settings (PRIVACY.md).
 */
export const REPORTS_KEY = 'reports.send';
/** At most so many different errors a start: one error repeating is one report. */
const MOST_A_START = 5;

export interface Report {
  /** The part of the app: the window, or the screen that failed. */
  area: string;
  message: string;
  stack?: string;
}

/** The player's own paths and the app's address taken out: «C:\Users\Ivan\…» → «~\…». */
export function scrub(text: string): string {
  return text
    .replace(/https?:\/\/(?:tauri\.localhost|localhost:\d+|127\.0\.0\.1:\d+)\//g, '')
    // A Windows user's folder may have spaces in its name: all of it, up to the next folder.
    .replace(/[A-Za-z]:\\Users\\[^\\\n]+/g, '~')
    .replace(/\/(?:home|Users)\/[^/\n]+/g, '~');
}

/** Windows as the browser tells it: 11 from the platform's version 13 on, else 10. */
async function windowsName(): Promise<string> {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(hints: string[]): Promise<{ platformVersion?: string }> } }).userAgentData;
  try {
    const version = (await data?.getHighEntropyValues(['platformVersion']))?.platformVersion;
    const major = Number(version?.split('.')[0]);
    if (Number.isFinite(major) && major > 0) return `Windows ${major >= 13 ? '11' : '10'}`;
  } catch {
    // Not told: Windows, as the app runs on nothing else.
  }
  return 'Windows';
}

/** What goes to the AI server: the report cut and scrubbed, the version and Windows. */
export async function reportBody(report: Report) {
  return {
    app: APP_VERSION,
    os: await windowsName(),
    area: report.area.slice(0, 40),
    message: scrub(report.message).slice(0, 300),
    ...(report.stack ? { stack: scrub(report.stack).slice(0, 2000) } : {}),
  };
}

const sent = new Set<string>();

/** The dev server (`npm run dev`, vite's port): its errors are the developer's own, not a player's. */
const fromDevServer = () => typeof location !== 'undefined' && location.port === '1420';

/** Sends a report unless the player turned them off, or it was sent this start, or enough were. */
export async function sendReport(platform: PlatformAdapter, report: Report): Promise<void> {
  if (fromDevServer() || sent.has(report.message) || sent.size >= MOST_A_START) return;
  if ((await platform.readSetting<boolean>(REPORTS_KEY)) === false) return;
  sent.add(report.message);
  try {
    await fetch(`${await aiServerOf(platform)}/v1/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device': await deviceOf(platform) },
      body: JSON.stringify(await reportBody(report)),
    });
  } catch {
    // Offline: the report is not kept to send later.
  }
}

/** For the tests: a new start. */
export const forgetSent = () => sent.clear();

/** The errors nothing else caught, in this window: each reported under the window's name. */
export function installReports(platform: PlatformAdapter, area: string): () => void {
  const onError = (e: ErrorEvent) => void sendReport(platform, { area, message: e.message || String(e.error), stack: e.error?.stack });
  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    void sendReport(platform, { area, message: reason?.message ?? String(e.reason), stack: reason?.stack });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** The player's choice, for the settings and the sign-in: on unless turned off. */
export function useReportsChoice(): [boolean, (on: boolean) => void] {
  const platform = usePlatform();
  const [on, setOn] = useState(true);
  useEffect(() => {
    void platform.readSetting<boolean>(REPORTS_KEY).then((saved) => setOn(saved !== false));
  }, [platform]);
  return [
    on,
    (next) => {
      setOn(next);
      void platform.writeSetting(REPORTS_KEY, next);
    },
  ];
}

/** The box itself, the same in the settings and at the sign-in. */
export const REPORTS_LABEL = 'Отправлять отчёты об ошибках';
export const REPORTS_HINT = 'Версия, Windows, где и что сломалось. Без ваших запросов, текстов и скриншотов — только чтобы исправить.';
