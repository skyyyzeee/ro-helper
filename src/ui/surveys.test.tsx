import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { ANSWERED_KEY, nextSurvey } from './surveys';

const poll = { id: 'fps-2026-10', question: 'Чувствуете ли просадки FPS?', answers: ['Нет', 'Да, заметно'] };

describe('a short poll (the team’s ask)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the first poll not answered, not past its day, for this server', () => {
    expect(nextSurvey([poll], 'tverskoi', [])?.id).toBe('fps-2026-10');
    expect(nextSurvey([poll], 'tverskoi', ['fps-2026-10'])).toBeNull();
    expect(nextSurvey([{ ...poll, until: '2020-01-01' }], 'tverskoi', [])).toBeNull();
    expect(nextSurvey([{ ...poll, servers: ['arbatskiy'] }], 'tverskoi', [])).toBeNull();
    expect(nextSurvey([{ ...poll, answers: ['одна'] }], 'tverskoi', [])).toBeNull();
  });

  it('shows on the home screen; an answer goes to the AI server with nothing about the player, and is asked once', async () => {
    const sent: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{"ok":true}', { status: 200 });
    }));
    const { user, platform } = await renderApp({ settings: { 'surveys.cache': [poll] } });
    const card = await screen.findByRole('region', { name: 'Опрос' });
    await user.click(within(card).getByRole('button', { name: 'Да, заметно' }));
    expect(screen.getByRole('region', { name: 'Опрос' })).toHaveTextContent('Спасибо! Ваш ответ: «Да, заметно»');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].url).toMatch(/\/v1\/survey$/);
    expect(Object.keys(sent[0].body as object).sort()).toEqual(['answer', 'app', 'server', 'survey']);
    expect(platform.settings.get(ANSWERED_KEY)).toEqual(['fps-2026-10']);
  });

  it('«Не сейчас» puts it away and sends nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { user, platform } = await renderApp({ settings: { 'surveys.cache': [poll] } });
    await user.click(within(await screen.findByRole('region', { name: 'Опрос' })).getByRole('button', { name: 'Не сейчас' }));
    expect(screen.queryByRole('region', { name: 'Опрос' })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringMatching(/survey/), expect.anything());
    expect(platform.settings.get(ANSWERED_KEY)).toEqual(['fps-2026-10']);
  });
});
