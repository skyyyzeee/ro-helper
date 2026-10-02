import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';
import { ADMIN_TOKEN_SETTING, type KeptMark } from './feedback';

const SKYZE = { id: 'user-1', name: 'Skyze', via: 'discord' as const };
const asAdmin = { account: SKYZE, server: (server: { admins: Set<string> }) => server.admins.add('user-1') };
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

const MARK: KeptMark = {
  id: 'm-1',
  at: '2026-10-02T21:40',
  server: 'tverskoi',
  app: '2.10.0',
  vote: 'down',
  question: 'вытащил телефон из кармана',
  scope: 'law',
  status: 'confirmed',
  norms: ['УК 66'],
  correction: 'это кража, ст. 65',
};

describe('the admins read the players\' marks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('with the AI server\'s admins\' key, kept on this computer: the corrections first', async () => {
    const asked: { url: string; auth?: string; body?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.Authorization, body: init?.body ? String(init.body) : undefined });
        return new Response(JSON.stringify({ marks: [MARK], today: 4 }), { status: 200 });
      }),
    );
    const { platform, user } = await renderApp(asAdmin);
    await user.keyboard('{Control>}5{/Control}');
    const settings = screen.getByRole('group', { name: 'Настройки' });
    await user.click(await within(within(settings).getByRole('navigation', { name: 'Разделы настроек' })).findByRole('button', { name: 'Администратор' }));

    await user.type(await screen.findByLabelText('Ключ администратора сервера ИИ'), 'secret-admin-key');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(platform.settings.get(ADMIN_TOKEN_SETTING)).toBe('secret-admin-key');

    const list = await screen.findByRole('list', { name: 'Отзывы об ИИ' });
    expect(list).toHaveTextContent('вытащил телефон из кармана');
    expect(list).toHaveTextContent('«это кража, ст. 65»');
    expect(screen.getByText('Сегодня отзывов: 4')).toBeInTheDocument();
    const read = asked.find((a) => a.url.includes('/v1/feedback'))!;
    expect(read.url).toContain('filter=raw');
    expect(read.auth).toBe('Bearer secret-admin-key');

    // Approved with its normal form: a line of the players' dictionary and an example for the exam.
    await user.click(within(list).getByRole('button', { name: 'Утвердить' }));
    const form = screen.getByRole('form', { name: 'Утвердить отзыв' });
    await user.clear(within(form).getByLabelText('Выражение игрока'));
    await user.type(within(form).getByLabelText('Выражение игрока'), 'вытащил из кармана');
    await user.type(within(form).getByLabelText('Нормальная форма (слова закона)'), 'кража');
    await user.type(within(form).getByLabelText('Правильные статьи'), 'УК 65');
    await user.click(within(form).getByRole('button', { name: 'Утвердить' }));
    await vi.waitFor(() => expect(asked.some((a) => a.url.endsWith('/v1/feedback/review'))).toBe(true));
    const sent = JSON.parse(asked.find((a) => a.url.endsWith('/v1/feedback/review'))!.body!);
    expect(sent).toEqual({ id: 'm-1', status: 'approved', phrase: 'вытащил из кармана', normalized: 'кража', scope: 'law', expected: ['УК 65'] });
  });
});

describe('the admin\'s debug view', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ask = async (options: Parameters<typeof renderApp>[0]) => {
    vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch()));
    const app = await renderApp({ ...options, settings: GEMINI });
    await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await app.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
    await screen.findByText('Применимые нормы');
    return app;
  };

  it('shows the admin how the answer came about: the question, the scope, the sources, the checks', async () => {
    await ask(asAdmin);
    const debug = await screen.findByText('Как ИИ пришёл к ответу');
    const view = debug.closest('details')!;
    expect(view).toHaveTextContent('legal');
    expect(view).toHaveTextContent('законы');
    expect(view).toHaveTextContent(/S1 УК ст\. 65/);
    expect(view).toHaveTextContent('всё прошло');
  });

  it('is not there for a player', async () => {
    await ask({});
    expect(screen.queryByText('Как ИИ пришёл к ответу')).not.toBeInTheDocument();
  });
});
