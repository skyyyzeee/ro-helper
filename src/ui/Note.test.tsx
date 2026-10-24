import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pinnedCards, renderApp } from '../test/renderApp';
import { notePinCard } from './pinCards';
import { hideNotes, refreshNotes, restoreNotes, showNotes } from './notes';

type Platform = Awaited<ReturnType<typeof renderApp>>['platform'];
const noteCards = (platform: Platform) => pinnedCards(platform).filter((card) => card.kind === 'note');
const settings = () => within(screen.getByRole('group', { name: 'Настройки' }));
const notesBlock = () => within(settings().getByRole('region', { name: 'Заметки' }));
/** What is pinned is in the settings: the side column no longer has it (skyze). */
async function openPinned(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(screen.getByRole('button', { name: 'Настройки' }));
  await user.click(settings().getByRole('button', { name: 'Закреплённые' }));
}

describe('the notes over the game (issue #40; a player asked for several, on a key, 24.10.2026)', () => {
  it('are written in «Закреплённые», each under a heading of its own, and pinned as one block of pages', async () => {
    const { platform, user } = await renderApp();
    await openPinned(user);
    expect(notesBlock().getByRole('button', { name: 'Закрепить поверх игры' })).toBeDisabled();

    // The first one is there to write in, headed «Заметка» unless the player calls it otherwise.
    expect(notesBlock().getByRole('textbox', { name: 'Заголовок заметки 1' })).toHaveValue('Заметка');
    await user.type(notesBlock().getByRole('textbox', { name: 'Текст заметки 1' }), 'Чёрный Skyline{Enter}А777АА');

    await user.click(notesBlock().getByRole('button', { name: 'Добавить заметку' }));
    const title = notesBlock().getByRole('textbox', { name: 'Заголовок заметки 2' });
    await user.clear(title);
    await user.type(title, 'Права');
    await user.type(notesBlock().getByRole('textbox', { name: 'Текст заметки 2' }), 'Вы имеете право хранить молчание');
    expect(platform.settings.get('notes.list')).toEqual([
      expect.objectContaining({ title: 'Заметка', text: 'Чёрный Skyline\nА777АА' }),
      expect.objectContaining({ title: 'Права', text: 'Вы имеете право хранить молчание' }),
    ]);

    await user.click(notesBlock().getByRole('button', { name: 'Закрепить поверх игры' }));
    await vi.waitFor(() => expect(noteCards(platform).map((card) => card.heading)).toEqual(['Заметка', 'Права']));
    // One block, a page a note.
    const block = platform.state.pins.find((group) => group.cards.some((card) => card.kind === 'note'))!;
    expect(block.cards).toHaveLength(2);
    expect(block.paged).toBe(true);

    // Written on, the card follows; deleted, its page goes.
    await user.type(notesBlock().getByRole('textbox', { name: 'Текст заметки 1' }), '{Enter}двое в масках');
    await vi.waitFor(() => expect(noteCards(platform)[0].lines).toEqual(['Чёрный Skyline', 'А777АА', 'двое в масках']));
    await user.click(notesBlock().getByRole('button', { name: 'Удалить заметку 1' }));
    await vi.waitFor(() => expect(noteCards(platform).map((card) => card.heading)).toEqual(['Права']));

    await user.click(notesBlock().getByRole('button', { name: 'Открепить заметки' }));
    await vi.waitFor(() => expect(noteCards(platform)).toEqual([]));
  });

  it('are there again at the next start; the one note of before comes first, as «Заметка»', async () => {
    const { user, platform } = await renderApp({ settings: { 'note.text': 'План: окружить банк' } });
    await openPinned(user);
    expect(notesBlock().getByRole('textbox', { name: 'Заголовок заметки 1' })).toHaveValue('Заметка');
    expect(notesBlock().getByRole('textbox', { name: 'Текст заметки 1' })).toHaveValue('План: окружить банк');
    await vi.waitFor(() => expect(platform.settings.get('notes.list')).toEqual([expect.objectContaining({ title: 'Заметка', text: 'План: окружить банк' })]));
  });

  it('come over the game on Alt+E, on from the start, and go on the next press — the assistant stays closed', async () => {
    const { platform } = await renderApp({ settings: { 'notes.list': [{ id: 'a', title: 'Права', text: 'Вы имеете право' }] } });
    await vi.waitFor(() => expect(platform.state.shortcuts.note).toBe('Alt+E'));

    act(() => platform.pressShortcut('note'));
    await vi.waitFor(() => expect(noteCards(platform).map((card) => card.heading)).toEqual(['Права']));
    expect(platform.calls.map((call) => call.method)).not.toContain('showOverlay');

    act(() => platform.pressShortcut('note'));
    await vi.waitFor(() => expect(noteCards(platform)).toEqual([]));
  });

  it('with none written yet, the key opens «Закреплённые» to write one', async () => {
    const { platform } = await renderApp();
    await vi.waitFor(() => expect(platform.state.shortcuts.note).toBe('Alt+E'));
    act(() => platform.pressShortcut('note'));
    await vi.waitFor(() => expect(notesBlock().getByRole('textbox', { name: 'Текст заметки 1' })).toHaveFocus());
    expect(platform.calls.map((call) => call.method)).toContain('showOverlay');
  });

  it('keep the key the player turned off, or set to another', async () => {
    const { platform, user } = await renderApp({ settings: { 'note.hotkey': '' } });
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+S'));
    expect(platform.state.shortcuts.note).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const block = settings().getByRole('region', { name: 'Заметки поверх игры' });
    await user.click(within(block).getByRole('switch', { name: 'Клавиша заметок' }));
    expect(platform.settings.get('note.hotkey')).toBe('Alt+E');
    await vi.waitFor(() => expect(platform.state.shortcuts.note).toBe('Alt+E'));
  });

  it('as a card: its heading, or «Заметка»; a line a line, the empty ones left out', () => {
    expect(notePinCard({ id: 'a', title: '  ', text: '  первая  \n\nвторая\n' })).toMatchObject({ id: 'a', kind: 'note', heading: 'Заметка', lines: ['  первая', 'вторая'] });
    expect(notePinCard({ id: 'b', title: 'Права', text: 'текст' })).toMatchObject({ heading: 'Права' });
  });

  it('as a block: shown where it stood, refreshed in place, and gone with the last note', () => {
    const surface = { width: 1920, height: 1080 };
    const notes = [
      { id: 'a', title: 'Права', text: 'один' },
      { id: 'b', title: 'Пусто', text: '   ' },
      { id: 'c', title: 'План', text: 'два' },
    ];
    const shown = showNotes([], notes, surface, { x: 300, y: 200 });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ x: 300, y: 200, paged: true });
    expect(shown[0].cards.map((card) => card.id)).toEqual(['a', 'c']);

    const moved = [{ ...shown[0], x: 50, y: 60 }];
    const refreshed = refreshNotes(moved, [notes[2]]);
    expect(refreshed[0]).toMatchObject({ x: 50, y: 60 });
    expect(refreshed[0].cards.map((card) => card.heading)).toEqual(['План']);
    expect(refreshNotes(refreshed, [])).toEqual([]);
    expect(hideNotes(shown)).toEqual([]);
  });

  it('read back: the list kept, else the one note of before, else one empty «Заметка»', () => {
    expect(restoreNotes([{ id: 'x', title: 'План', text: 'т' }], 'старая')).toEqual([{ id: 'x', title: 'План', text: 'т' }]);
    expect(restoreNotes(undefined, 'старая')).toEqual([{ id: 'note', title: 'Заметка', text: 'старая' }]);
    expect(restoreNotes(undefined, undefined)).toEqual([{ id: 'note', title: 'Заметка', text: '' }]);
    expect(restoreNotes('мусор', undefined)).toEqual([{ id: 'note', title: 'Заметка', text: '' }]);
  });
});
