import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING, historyKey, type StoredConversation } from './ai';

/** These tests talk to Gemini with a key, the way a player outside Russia may. */
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };
const saved = (platform: { settings: Map<string, unknown> }) => platform.settings.get(historyKey('tverskoi')) as StoredConversation[];
const cases = () => screen.getByRole('region', { name: 'Дела' });

async function asked(settings: Record<string, unknown> = {}) {
  const app = await renderApp({ settings: { ...GEMINI, ...settings } });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  return app;
}

describe('cases: the analyses kept (ADR 0003)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps each case with the laws it was worked out by, and opens it again with its articles', async () => {
    const { platform, user } = await asked();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();

    const [record] = saved(platform);
    expect(record).toMatchObject({ version: 2, title: 'у меня украли телефон', archived: false });
    expect(record.created).toBeTruthy();
    expect(record.messages.map((m) => m.role)).toEqual(['user', 'ai']);
    // The snapshot: the case's article as it read then, and the pack's version.
    expect(Object.keys(record.snapshot!.articles)).toHaveLength(1);
    expect(record.snapshot!.label).toMatch(/^\d{4}\.\d+\.\d+$/);

    // A new chat, then the case back from «Дела».
    await user.click(screen.getByRole('button', { name: 'Новый чат' }));
    expect(screen.queryByText(/Это кража/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дела' }));
    await user.click(within(cases()).getByRole('button', { name: /^у меня украли телефон/ }));
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();
    // Its article is found again in the laws and checked again: it still opens, still stands, nothing changed.
    expect(screen.getAllByRole('button', { name: /^УК ст\. 65/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Подтверждено')).toBeInTheDocument();
    expect(screen.queryByText(/Изменилось после создания дела/)).not.toBeInTheDocument();
  });

  it('says what changed in the laws since the case was made, and checks it against them', async () => {
    // A case made, then its article «edited» in the laws: its print in the snapshot is not today's.
    const first = await asked();
    await first.user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
    await screen.findByText(/Это кража/);
    const [record] = saved(first.platform);
    cleanup();
    const [id] = Object.keys(record.snapshot!.articles);
    const old: StoredConversation = { ...record, snapshot: { ...record.snapshot!, articles: { [id]: '00000000' } } };

    const { platform, user } = await asked({ [historyKey('tverskoi')]: [old] });
    await user.click(screen.getByRole('button', { name: 'Дела' }));
    await user.click(within(cases()).getByRole('button', { name: /^у меня украли телефон/ }));
    expect((await screen.findByText(/Изменилось после создания дела:/)).closest('[role=status]')).toHaveTextContent(/УК ст\. 65/);

    await user.click(screen.getByRole('button', { name: 'Проверить по текущей базе' }));
    await vi.waitFor(() => expect(screen.queryByText(/Изменилось после создания дела/)).not.toBeInTheDocument());
    const checked = saved(platform)[0];
    // The snapshot of when it was made stays; the check is kept beside it, by today's laws.
    expect(checked.snapshot!.articles[id]).toBe('00000000');
    expect(checked.checked!.articles[id]).not.toBe('00000000');
  });

  it('offers questions to try the first time, asked with a press', async () => {
    await asked();
    const examples = screen.getByLabelText('Примеры вопросов');
    await within(examples).findByRole('button', { name: /У меня украли телефон из кармана/ });
  });
});

describe('cases: named, pinned, archived, copied, found', () => {
  const OLD: StoredConversation = {
    id: 'c1',
    updated: new Date().toISOString(),
    title: 'старый вопрос',
    messages: [
      { role: 'user', text: 'старый вопрос про кражу' },
      { role: 'ai', text: 'старый ответ' },
    ],
  };
  const two = { [historyKey('tverskoi')]: [OLD, { ...OLD, id: 'c2', title: 'второй', messages: [{ role: 'user' as const, text: 'про угон' }] }] };
  const menu = async (user: Awaited<ReturnType<typeof renderApp>>['user'], title: string, action: string) => {
    const summary = within(cases()).getByLabelText(`Действия с делом «${title}»`);
    await user.click(summary);
    await user.click(within(summary.closest('details')!).getByRole('button', { name: action }));
  };

  it('a conversation from before reads as a case, its laws of then unknown', async () => {
    const { user } = await asked(two);
    await user.click(screen.getByRole('button', { name: 'Дела' }));
    expect(within(cases()).getByRole('button', { name: /^старый вопрос/ })).not.toHaveTextContent('база');
  });

  it('renames, pins on top, archives apart, copies — and keeps it all', async () => {
    const { platform, user } = await asked(two);
    await user.click(screen.getByRole('button', { name: 'Дела' }));

    await menu(user, 'второй', 'Переименовать');
    await user.clear(within(cases()).getByLabelText('Название дела'));
    await user.type(within(cases()).getByLabelText('Название дела'), 'Угон у банка{Enter}');
    expect(saved(platform).find((c) => c.id === 'c2')).toMatchObject({ title: 'Угон у банка', named: true });

    await user.click(within(cases()).getByRole('button', { name: 'Закрепить «Угон у банка»' }));
    expect(within(screen.getByRole('list', { name: 'Закреплённые дела' })).getByRole('button', { name: /^Угон у банка/ })).toBeInTheDocument();

    await menu(user, 'старый вопрос', 'В архив');
    expect(within(cases()).queryByRole('list', { name: 'Дела' })).not.toBeInTheDocument();
    await user.click(within(cases()).getByRole('button', { name: 'Архив (1)' }));
    expect(within(screen.getByRole('list', { name: 'Архив дел' })).getByRole('button', { name: /^старый вопрос/ })).toBeInTheDocument();

    await menu(user, 'Угон у банка', 'Дублировать');
    expect(saved(platform).map((c) => c.title)).toEqual(['Угон у банка (копия)', 'старый вопрос', 'Угон у банка']);
  });

  it('finds a case by the words of its name or of what was asked in it', async () => {
    const { user } = await asked(two);
    await user.click(screen.getByRole('button', { name: 'Дела' }));
    await user.type(within(cases()).getByRole('searchbox', { name: 'Поиск по делам' }), 'кражу');
    expect(within(cases()).getByRole('button', { name: /^старый вопрос/ })).toBeInTheDocument();
    expect(within(cases()).queryByRole('button', { name: /^второй/ })).not.toBeInTheDocument();
  });

  it('deletes a case, or all of them', async () => {
    const { platform, user } = await asked(two);
    await user.click(screen.getByRole('button', { name: 'Дела' }));
    await menu(user, 'второй', 'Удалить');
    expect(saved(platform).map((c) => c.id)).toEqual(['c1']);
    await user.click(within(cases()).getByRole('button', { name: 'Удалить все' }));
    expect(saved(platform)).toEqual([]);
    expect(within(cases()).getByText(/Здесь появятся ваши разборы/)).toBeInTheDocument();
  });
});
