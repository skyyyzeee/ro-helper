import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pinnedCards, renderApp } from '../test/renderApp';
import { notePinCard } from './pinCards';
import { clashes, freeOf } from './keymap';
import { hideNotes, noteOnShow, refreshNotes, restoreNotes, showNote, showNotes, turnNotes } from './notes';

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
    const block = settings().getByRole('region', { name: 'Горячие клавиши' });
    await user.click(within(block).getByRole('switch', { name: 'Заметки: показать и спрятать' }));
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

describe('turning the notes over the game with the assistant shut (a player asked, 24.10.2026)', () => {
  const NOTES = [
    { id: 'a', title: 'Права', text: 'Вы имеете право', hotkey: 'Alt+1' },
    { id: 'b', title: 'План', text: 'Окружить банк', hotkey: 'Alt+2' },
    { id: 'c', title: 'Приметы', text: 'Чёрный Skyline' },
  ];
  const block = (platform: Platform) => platform.state.pins.find((group) => group.cards.some((card) => card.kind === 'note'));
  const onShow = (platform: Platform) => {
    const shown = block(platform);
    return shown ? shown.cards[shown.page ?? 0].heading : undefined;
  };

  it('brings up a note on its own key, turns to another on its, and hides on the same one again', async () => {
    const { platform } = await renderApp({ settings: { 'notes.list': NOTES } });
    await vi.waitFor(() => expect(platform.state.shortcuts['note:b']).toBe('Alt+2'));
    expect(platform.state.shortcuts['note:c']).toBeUndefined();

    act(() => platform.pressShortcut('note:b'));
    await vi.waitFor(() => expect(onShow(platform)).toBe('План'));
    act(() => platform.pressShortcut('note:a'));
    await vi.waitFor(() => expect(onShow(platform)).toBe('Права'));
    act(() => platform.pressShortcut('note:a'));
    await vi.waitFor(() => expect(block(platform)).toBeUndefined());
    expect(platform.calls.map((call) => call.method)).not.toContain('showOverlay');
  });

  it('turns on and back on their keys, going round; hidden, either brings them up', async () => {
    const { platform } = await renderApp({ settings: { 'notes.list': NOTES, 'notes.next': 'Alt+D', 'notes.prev': 'Alt+A' } });
    await vi.waitFor(() => expect(platform.state.shortcuts['notes-prev']).toBe('Alt+A'));

    act(() => platform.pressShortcut('notes-next'));
    await vi.waitFor(() => expect(onShow(platform)).toBe('Права'));
    act(() => platform.pressShortcut('notes-next'));
    await vi.waitFor(() => expect(onShow(platform)).toBe('План'));
    act(() => platform.pressShortcut('notes-prev'));
    act(() => platform.pressShortcut('notes-prev'));
    await vi.waitFor(() => expect(onShow(platform)).toBe('Приметы'));
  });

  it('are set in «Клавиши»: a note’s key on its switch is Alt and its number; one the assistant holds is told and not registered', async () => {
    const { platform, user } = await renderApp({ settings: { 'notes.list': [{ id: 'a', title: 'Права', text: 'т' }, { id: 'b', title: 'План', text: 'т', hotkey: 'Alt+Q' }] } });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const keys = within(settings().getByRole('region', { name: 'Горячие клавиши' }));

    await user.click(keys.getByRole('switch', { name: 'Заметка «Права»' }));
    expect(platform.settings.get('notes.list')).toEqual([expect.objectContaining({ id: 'a', hotkey: 'Alt+1' }), expect.objectContaining({ id: 'b', hotkey: 'Alt+Q' })]);
    await vi.waitFor(() => expect(platform.state.shortcuts['note:a']).toBe('Alt+1'));

    expect(within(keys.getByRole('group', { name: 'Заметка «План»' })).getByRole('alert')).toHaveTextContent('уже у «Открыть и скрыть ассистент»');
    expect(platform.state.shortcuts['note:b']).toBeUndefined();

    await user.click(keys.getByRole('switch', { name: 'Следующая заметка' }));
    expect(platform.settings.get('notes.next')).toBe('Alt+D');
    await vi.waitFor(() => expect(platform.state.shortcuts['notes-next']).toBe('Alt+D'));
  });

  it('as a block: the note on show, turned round both ways, and brought up on its page', () => {
    const surface = { width: 1920, height: 1080 };
    const shown = showNote([], NOTES, 'b', surface);
    expect(noteOnShow(shown)).toBe('b');
    expect(noteOnShow(turnNotes(shown, 1))).toBe('c');
    expect(noteOnShow(turnNotes(turnNotes(shown, 1), 1))).toBe('a');
    expect(noteOnShow(turnNotes(shown, -2))).toBe('c');
    expect(turnNotes([], 1)).toEqual([]);
    // Nothing written, nothing to bring up.
    expect(showNote([], [{ id: 'e', title: 'Пусто', text: ' ' }], 'e', surface)).toEqual([]);
    expect(restoreNotes([{ id: 'x', title: 'П', text: 'т', hotkey: 'Alt+1' }, { id: 'y', title: 'П', text: 'т', hotkey: 5 }], undefined)).toEqual([
      { id: 'x', title: 'П', text: 'т', hotkey: 'Alt+1' },
      { id: 'y', title: 'П', text: 'т' },
    ]);
  });
});

describe('the keys in one list (keymap)', () => {
  it('tell a key set twice to the later one, whatever its case, and leave the ones off alone', () => {
    const found = clashes([
      { id: 'overlay', label: 'Ассистент', hotkey: 'Alt+Q' },
      { id: 'quick', label: 'Поиск', hotkey: '' },
      { id: 'note:a', label: 'Заметка', hotkey: 'alt+q' },
      { id: 'note:b', label: 'Вторая', hotkey: '' },
    ]);
    expect([...found]).toEqual([['note:a', 'Ассистент']]);
    expect(freeOf('Alt+1', ['Alt+Q', ''])).toBe(true);
    expect(freeOf('alt+q', ['Alt+Q'])).toBe(false);
    expect(freeOf('', [])).toBe(false);
  });
});
