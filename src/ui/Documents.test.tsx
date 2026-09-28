import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';
import { AUTHOR_KEY } from './documents';

/** These tests talk to Gemini with a key, the way a player outside Russia may. */
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

const REPORT = 'РАПОРТ\nЯ, лейтенант полиции Иван Петров, задержал гражданина {ФИО задержанного}.\nКвалификация: УК ст. 65 «Кража».';

/** Gemini as the tests see it: the law terms first, then the document; every request kept to look at. */
function fakeGemini() {
  const bodies: string[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const body = JSON.parse(String(init.body)) as { generationConfig?: { responseMimeType?: string } };
    const text = body.generationConfig?.responseMimeType === 'application/json' ? '["кража"]' : REPORT;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return bodies;
}

describe('writing a document with the AI', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes the chosen document from the situation, by the author, with the articles to open, and copies it', async () => {
    const bodies = fakeGemini();
    const { platform, user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Составить документ' }));
    const view = screen.getByRole('region', { name: 'Составить документ' });
    expect(within(view).getByRole('radio', { name: 'Рапорт' })).toHaveAttribute('aria-checked', 'true');

    // Who writes: once, kept in the settings.
    await user.type(within(view).getByRole('textbox', { name: 'ФИО' }), 'Иван Петров');
    await user.type(within(view).getByRole('textbox', { name: 'Звание' }), 'лейтенант полиции');
    await user.click(within(view).getByRole('button', { name: 'Сохранить' }));
    expect(platform.settings.get(AUTHOR_KEY)).toEqual({ name: 'Иван Петров', rank: 'лейтенант полиции', position: '' });

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'украл телефон у прохожего{Enter}');
    expect(await within(view).findByText(/задержал гражданина/)).toBeInTheDocument();
    // The author and the found articles went to the AI; the gap it could not fill is marked.
    expect(bodies.at(-1)).toContain('лейтенант полиции');
    expect(bodies.at(-1)).toContain('УК ст. 65');
    expect(within(view).getByText('{ФИО задержанного}')).toHaveClass('doc__gap');
    expect(within(view).getByRole('button', { name: /УК ст\. 65 «Кража»/ })).toBeInTheDocument();

    await user.click(within(view).getByRole('button', { name: 'Скопировать для форума' }));
    expect(platform.state.clipboard).toBe(REPORT);
  });

  it('lets the text be corrected before copying', async () => {
    fakeGemini();
    const { platform, user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Составить документ' }));
    const view = screen.getByRole('region', { name: 'Составить документ' });
    await user.click(within(view).getByRole('radio', { name: 'Жалоба' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'сотрудник обыскал без причины{Enter}');
    await within(view).findByText(/задержал гражданина/);

    await user.click(within(view).getByRole('button', { name: 'Исправить' }));
    const text = within(view).getByRole('textbox', { name: 'Текст документа' });
    await user.clear(text);
    await user.type(text, 'Исправленный текст');
    await user.click(within(view).getByRole('button', { name: 'Готово' }));
    await user.click(within(view).getByRole('button', { name: 'Скопировать для форума' }));
    expect(platform.state.clipboard).toBe('Исправленный текст');
  });

  it('asks for the key before anything else', async () => {
    const { user } = await renderApp({ settings: { [AI_PROVIDER_SETTING]: 'gemini' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Составить документ' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'что-то случилось{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Сначала вставьте ключ Gemini');
  });
});
