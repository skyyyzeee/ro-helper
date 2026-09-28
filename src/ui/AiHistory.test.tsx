import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING, historyKey, type StoredConversation } from './ai';

/** These tests talk to Gemini with a key, the way a player outside Russia may. */
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

describe('the history of AI analyses', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fakeGeminiFetch()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps each conversation, and opens it again with its articles', async () => {
    const { platform, user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();

    const saved = platform.settings.get(historyKey('tverskoi')) as StoredConversation[];
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('у меня украли телефон');
    expect(saved[0].messages.map((m) => m.role)).toEqual(['user', 'ai']);

    // A new conversation, then the old one back from the history.
    await user.click(screen.getByRole('button', { name: 'Новый разбор' }));
    expect(screen.queryByText(/Это кража/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'История ИИ-разборов' }));
    const history = screen.getByRole('region', { name: 'История ИИ-разборов' });
    await user.click(within(history).getByRole('button', { name: /^у меня украли телефон/ }));
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();
    // Its article is found again in the laws and checked again: it still opens, and still stands.
    expect(screen.getAllByRole('button', { name: /^УК ст\. 65/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Подтверждено')).toBeInTheDocument();
  });

  it('offers questions to try the first time, asked with a press', async () => {
    const { user } = await renderApp({ settings: GEMINI });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    const examples = screen.getByLabelText('Примеры вопросов');
    await user.click(within(examples).getByRole('button', { name: /Какое наказание за кражу телефона/ }));
    expect(await screen.findByText(/Это кража/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Примеры вопросов')).not.toBeInTheDocument();
  });

  it('forgets a conversation, or all of them', async () => {
    const conversation: StoredConversation = {
      id: 'c1',
      updated: new Date().toISOString(),
      title: 'старый вопрос',
      messages: [
        { role: 'user', text: 'старый вопрос' },
        { role: 'ai', text: 'старый ответ' },
      ],
    };
    const { platform, user } = await renderApp({ settings: { [historyKey('tverskoi')]: [conversation, { ...conversation, id: 'c2', title: 'второй' }] } });
    await user.click(screen.getByRole('button', { name: 'История ИИ-разборов' }));
    const history = screen.getByRole('region', { name: 'История ИИ-разборов' });
    await user.click(within(history).getByRole('button', { name: 'Удалить разбор «второй»' }));
    expect((platform.settings.get(historyKey('tverskoi')) as StoredConversation[]).map((c) => c.id)).toEqual(['c1']);
    await user.click(within(history).getByRole('button', { name: 'Очистить историю' }));
    expect(platform.settings.get(historyKey('tverskoi'))).toEqual([]);
    expect(within(history).getByText(/Здесь появятся ваши вопросы ИИ/)).toBeInTheDocument();
  });
});
