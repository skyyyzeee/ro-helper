import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pinnedCards, renderApp } from '../test/renderApp';
import { notePinCard } from './pinCards';

const noteCard = (platform: Awaited<ReturnType<typeof renderApp>>['platform']) => pinnedCards(platform).find((card) => card.kind === 'note');
const settings = () => within(screen.getByRole('group', { name: 'Настройки' }));

describe('the note over the game (issue #40)', () => {
  it('is written in «Закреплённое», kept on this computer, and pinned as a card that follows the text', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Закреплённое' }));
    const field = settings().getByRole('textbox', { name: 'Заметка' });
    expect(settings().getByRole('button', { name: 'Закрепить поверх игры' })).toBeDisabled();

    await user.type(field, 'Чёрный Skyline{Enter}А777АА');
    expect(platform.settings.get('note.text')).toBe('Чёрный Skyline\nА777АА');
    await user.click(settings().getByRole('button', { name: 'Закрепить поверх игры' }));
    await vi.waitFor(() => expect(noteCard(platform)).toMatchObject({ heading: 'Заметка', lines: ['Чёрный Skyline', 'А777АА'] }));

    // Written on, the card follows.
    await user.type(field, '{Enter}двое в масках');
    await vi.waitFor(() => expect(noteCard(platform)!.lines).toEqual(['Чёрный Skyline', 'А777АА', 'двое в масках']));

    await user.click(settings().getByRole('button', { name: 'Открепить заметку' }));
    await vi.waitFor(() => expect(noteCard(platform)).toBeUndefined());
  });

  it('is there again at the next start', async () => {
    const { user } = await renderApp({ settings: { 'note.text': 'План: окружить банк' } });
    await user.click(screen.getByRole('button', { name: 'Закреплённое' }));
    expect(settings().getByRole('textbox', { name: 'Заметка' })).toHaveValue('План: окружить банк');
  });

  it('has a key, off unless turned on; pressed, it shows the overlay on the note with the cursor in it', async () => {
    const { platform, user } = await renderApp();
    await vi.waitFor(() => expect(platform.state.quickHotkey).toBe('Alt+S'));
    expect(platform.state.shortcuts.note).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const block = settings().getByRole('region', { name: 'Заметка' });
    await user.click(within(block).getByRole('switch', { name: 'Клавиша заметки' }));
    expect(platform.settings.get('note.hotkey')).toBe('Ctrl+Shift+N');
    await vi.waitFor(() => expect(platform.state.shortcuts.note).toBe('Ctrl+Shift+N'));

    await user.click(screen.getByRole('button', { name: 'Поиск' }));
    act(() => platform.pressShortcut('note'));
    await vi.waitFor(() => expect(settings().getByRole('textbox', { name: 'Заметка' })).toHaveFocus());
    expect(platform.calls.map((call) => call.method)).toContain('showOverlay');
  });

  it('as a card: a line a line, the empty ones left out', () => {
    expect(notePinCard('  первая  \n\nвторая\n')).toMatchObject({ id: 'note', kind: 'note', heading: 'Заметка', lines: ['  первая', 'вторая'] });
  });
});
