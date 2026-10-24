import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisOf, isAnalysis } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_CUSTOM_SETTING, AI_PROVIDER_SETTING, NO_CUSTOM } from './ai';

/** The player's own OpenAI-compatible AI: the law terms, then the analysis. Every request is kept with its address. */
function fakeOwnAi() {
  const calls: { url: string; headers: Headers; body: { model: string; messages: { role: string; content: string }[] } }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as (typeof calls)[number]['body'];
      calls.push({ url, headers: new Headers(init.headers), body });
      const system = body.messages[0]?.content ?? '';
      const context = body.messages.at(-1)?.content ?? '';
      const content = isAnalysis(system) ? analysisOf(context) : '{"phrases": ["кража"]}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }),
  );
  return calls;
}

describe('the player’s own AI (issue #2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is set up in the settings — address, model, key — and kept on this computer', async () => {
    const { platform, user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    await user.click(screen.getByRole('radio', { name: 'Свой ИИ' }));
    expect(platform.settings.get(AI_PROVIDER_SETTING)).toBe('custom');

    const save = screen.getByRole('button', { name: 'Сохранить' });
    await user.type(screen.getByLabelText('Адрес API'), 'https://openrouter.ai/api/v1');
    // No model yet: nothing to save.
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Модель'), 'openai/gpt-4o-mini');
    await user.type(screen.getByLabelText(/^Ключ API/), 'sk-test');
    await user.click(save);
    expect(platform.settings.get(AI_CUSTOM_SETTING)).toEqual({ url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', key: 'sk-test' });
    expect(screen.getAllByRole('status').some((status) => status.textContent === 'Сохранено')).toBe(true);
    // The key is not shown again, only that it is saved.
    expect(screen.getByLabelText(/^Ключ API/)).toHaveValue('');
    expect(screen.getByText('Ключ API (сохранён)')).toBeInTheDocument();
  });

  it('answers through it, with the player’s key and model, checked against the laws as ever', async () => {
    const calls = fakeOwnAi();
    const { user } = await renderApp({
      settings: { [AI_PROVIDER_SETTING]: 'custom', [AI_CUSTOM_SETTING]: { url: 'https://my-ai.example/v1', model: 'my-model', key: 'sk-own' } },
    });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');

    expect(await screen.findByText('Это кража телефона.')).toBeInTheDocument();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const call of calls) {
      expect(call.url).toBe('https://my-ai.example/v1/chat/completions');
      expect(call.headers.get('Authorization')).toBe('Bearer sk-own');
      expect(call.body.model).toBe('my-model');
    }
  });

  it('says what to fill in when it is chosen but not set up', async () => {
    const calls = fakeOwnAi();
    const { user } = await renderApp({ settings: { [AI_PROVIDER_SETTING]: 'custom' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по законам' }), 'у меня украли телефон{Enter}');
    expect(await screen.findByText(NO_CUSTOM, { exact: false })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
