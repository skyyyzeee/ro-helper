import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePlatform } from '../platform/fake';
import { REPORTS_KEY, forgetSent, reportBody, scrub, sendReport } from './reports';

describe('reports of the app’s own errors (skyze: automatic, on unless turned off)', () => {
  const sent: unknown[] = [];
  beforeEach(() => {
    sent.length = 0;
    forgetSent();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response('{"ok":true}');
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('takes the player’s own paths and the app’s address out', () => {
    expect(scrub('at calc (http://tauri.localhost/assets/index.js:1:2) C:\\Users\\Ivan Petrov\\AppData')).toBe('at calc (assets/index.js:1:2) ~\\AppData');
    expect(scrub('C:\\Users\\Ivan\\AppData\\Local')).toBe('~\\AppData\\Local');
  });

  it('sends what broke and where — the version, Windows, the part, the message — cut to length', async () => {
    const body = await reportBody({ area: 'Оверлей', message: 'x'.repeat(500), stack: 'at f (http://tauri.localhost/a.js:1:1)' });
    expect(Object.keys(body).sort()).toEqual(['app', 'area', 'message', 'os', 'stack']);
    expect(body.message).toHaveLength(300);
    expect(body.stack).toBe('at f (a.js:1:1)');
  });

  it('sends one error once a start, and nothing when the player turned the reports off', async () => {
    const platform = createFakePlatform();
    await sendReport(platform, { area: 'Оверлей', message: 'boom' });
    await sendReport(platform, { area: 'Оверлей', message: 'boom' });
    expect(sent).toHaveLength(1);

    platform.settings.set(REPORTS_KEY, false);
    await sendReport(platform, { area: 'Оверлей', message: 'another' });
    expect(sent).toHaveLength(1);
  });
});
