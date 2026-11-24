import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };
const modes = [
  { mode: 'chat', label: 'Сообщение ИИ', text: 'у меня украли телефон' },
  { mode: 'lawyer', label: 'Требования адвоката', text: 'Адвокат требует копию протокола задержания' },
  { mode: 'detention', label: 'Ход задержания', text: 'Представился, задержал, разъяснил права' },
  { mode: 'document', label: 'Описание для документа', text: 'Задержал подозреваемого в краже телефона' },
] as const;

afterEach(() => vi.unstubAllGlobals());

describe('recovering a failed AI request', () => {
  it.each(modes)('restores an editable $mode request without sending it until explicitly asked', async ({ mode, label, text }) => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', fetch);
    const { user } = await renderApp({ settings: GEMINI, profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    if (mode === 'lawyer' || mode === 'detention') {
      await user.click(screen.getByRole('radio', { name: 'Проверка' }));
      if (mode === 'detention') await user.click(screen.getByRole('radio', { name: 'Ход задержания' }));
    } else if (mode === 'document') {
      await user.click(screen.getByRole('button', { name: 'Составить документ' }));
    }
    const input = screen.getByRole('textbox', { name: label });
    await user.type(input, text);
    await user.click(screen.getByRole('button', { name: 'Отправить запрос ИИ' }));
    await screen.findByRole('alert');
    expect(input).toHaveValue('');
    const before = fetch.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Вернуть текст в поле' }));
    expect(input).toHaveValue(text);
    expect(input).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(before);
    await user.type(input, ' — уточнение');
    await user.click(screen.getByRole('button', { name: 'Отправить запрос ИИ' }));
    await vi.waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Вернуть текст в поле' })).toHaveLength(mode === 'chat' ? 2 : 1));
    const buttons = screen.getAllByRole('button', { name: 'Вернуть текст в поле' });
    await user.click(buttons.at(-1)!);
    expect(input).toHaveValue(`${text} — уточнение`);
  });
});
