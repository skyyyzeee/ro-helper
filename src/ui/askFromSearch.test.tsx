import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGeminiFetch } from '../test/fakeAi';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';

const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

// A question typed into the search goes to the AI on Enter; a few words of an article
// stay the search's.
describe('asking the AI from the search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('puts «Спросить ИИ» first and chosen for a question, and Enter asks it', async () => {
    const fetch = vi.fn(fakeGeminiFetch({}));
    vi.stubGlobal('fetch', fetch);
    const { user } = await renderApp({ settings: GEMINI });
    const search = screen.getByRole('searchbox', { name: 'Поиск по законам' });
    await user.type(search, 'у меня украли телефон на улице');
    const offer = screen.getByRole('button', { name: /Спросить ИИ: «у меня украли телефон на улице»/ });
    expect(offer).toHaveClass('ai-offer--chosen');
    // Above the articles.
    expect(offer.compareDocumentPosition(screen.getByRole('list', { name: 'Результаты поиска' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(await within(screen.getByRole('log')).findByText('у меня украли телефон на улице')).toBeInTheDocument();
  });

  it('goes down to the articles with ↓, and leaves a few words of an article to the search', async () => {
    const { user } = await renderApp();
    const search = screen.getByRole('searchbox', { name: 'Поиск по законам' });
    await user.type(search, 'что будет за кражу');
    await within(screen.getByRole('list', { name: 'Результаты поиска' })).findAllByRole('listitem');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Спросить ИИ/ })).not.toHaveClass('ai-offer--chosen');
    await user.clear(search);
    await user.type(search, 'кража');
    expect(screen.queryByRole('button', { name: /Спросить ИИ/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Разобрать с ИИ/ })).toBeInTheDocument();
  });
});
