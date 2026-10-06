import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pinnedCards, renderApp } from '../test/renderApp';
import { PHRASE_KEYS_SETTING, phrasesKey } from './phrases';

const OFFICER = { profile: { organization: 'gibdd' }, settings: { player: { gameName: 'Ivan_Petrov', position: 'Сержант' } } };
const rail = () => screen.getByRole('navigation', { name: 'Разделы' });

async function openDepartment(options: Parameters<typeof renderApp>[0] = OFFICER) {
  const app = await renderApp(options);
  await app.user.click(within(rail()).getByRole('button', { name: 'Отдел: порядок действий по закону' }));
  return { ...app, block: () => screen.getByRole('region', { name: 'Заготовки для чата' }) };
}

describe('phrases for the chat on the faction’s page (issue #40)', () => {
  it('puts a phrase into the clipboard at a click, the profile’s words in — and types nothing anywhere', async () => {
    const { platform, user, block } = await openDepartment();
    const hello = within(block()).getByRole('button', { name: /Представиться/ });
    expect(hello).toHaveTextContent('Здравствуйте. Сержант Ivan_Petrov, ГИБДД.');
    await user.click(hello);
    expect(platform.state.clipboard).toBe('Здравствуйте. Сержант Ivan_Petrov, ГИБДД.');
    expect(within(block()).getByRole('button', { name: /Скопировано/ })).toBeInTheDocument();
    expect(block()).toHaveTextContent('Ассистент ничего не печатает в игру');
  });

  it('lets the player write their own, and go back to the faction’s set', async () => {
    const { platform, user, block } = await openDepartment();
    await user.click(within(block()).getByRole('button', { name: 'Изменить' }));
    const first = within(block()).getByRole('group', { name: 'Заготовка 1' });
    await user.clear(within(first).getByRole('textbox', { name: 'Текст' }));
    await user.type(within(first).getByRole('textbox', { name: 'Текст' }), 'Добрый день, инспектор Петров.');
    await user.click(within(block()).getByRole('button', { name: 'Удалить заготовку 2' }));
    await user.click(within(block()).getByRole('button', { name: 'Готово' }));

    const kept = platform.settings.get(phrasesKey('tverskoi', 'gibdd')) as { title: string; text: string }[];
    expect(kept[0]).toMatchObject({ title: 'Представиться', text: 'Добрый день, инспектор Петров.' });
    expect(kept.map((p) => p.title)).not.toContain('Требование остановиться');
    expect(within(block()).getByRole('button', { name: /Представиться/ })).toHaveTextContent('Добрый день, инспектор Петров.');

    await user.click(within(block()).getByRole('button', { name: 'Изменить' }));
    await user.click(within(block()).getByRole('button', { name: 'Вернуть набор отдела' }));
    expect(within(block()).getByRole('button', { name: /Требование остановиться/ })).toBeInTheDocument();
  });

  it('pins them over the game, where a press copies one', async () => {
    const { platform, user, block } = await openDepartment();
    await user.click(within(block()).getByRole('button', { name: 'Закрепить заготовки поверх игры' }));
    await vi.waitFor(() => expect(pinnedCards(platform).map((card) => card.kind)).toContain('phrases'));
    const card = pinnedCards(platform).find((c) => c.kind === 'phrases')!;
    expect(card.actions![0]).toEqual({ label: 'Представиться', text: 'Здравствуйте. Сержант Ivan_Petrov, ГИБДД.' });
  });

  it('copies by a key over the game once the player turns the keys on, and says so there', async () => {
    const { platform } = await openDepartment({ ...OFFICER, settings: { ...OFFICER.settings, [PHRASE_KEYS_SETTING]: 'Alt' } });
    await vi.waitFor(() => expect(platform.state.shortcuts['phrase-2']).toBe('Alt+2'));
    expect(Object.keys(platform.state.shortcuts).filter((name) => name.startsWith('phrase-'))).toHaveLength(9);
    act(() => platform.pressShortcut('phrase-2'));
    expect(platform.state.clipboard).toBe('Водитель, прижмитесь к обочине и остановите транспортное средство.');
    await vi.waitFor(() => expect(platform.state.toast).toMatchObject({ title: 'Скопировано: Требование остановиться', text: 'Вставьте в чат игры: Ctrl+V' }));
  });

  it('holds no keys until asked to, and tells of the ones another program holds', async () => {
    const quiet = await openDepartment();
    await vi.waitFor(() => expect(quiet.platform.state.quickHotkey).toBe('Alt+S'));
    expect(Object.keys(quiet.platform.state.shortcuts).filter((name) => name.startsWith('phrase-'))).toEqual([]);
  });

  it('tells of the keys another program holds', async () => {
    const { block } = await openDepartment({ ...OFFICER, settings: { ...OFFICER.settings, [PHRASE_KEYS_SETTING]: 'Alt' }, platform: { takenHotkeys: ['Alt+3'] } });
    expect(await within(block()).findByRole('alert')).toHaveTextContent('Alt + 3 — сочетание занято другой программой');
  });

  it('is not there without a faction', async () => {
    await openDepartment({});
    expect(screen.queryByRole('region', { name: 'Заготовки для чата' })).not.toBeInTheDocument();
  });
});
