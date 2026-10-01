import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TVERSKOI_PACK } from '../data';
import { articleText } from '../core';
import { renderApp } from '../test/renderApp';
import { AI_KEY_SETTING, AI_PROVIDER_SETTING } from './ai';
import { defaultDocuments, pickArticle } from './trainer';

/** These tests talk to Gemini with a key, the way a player outside Russia may. */
const GEMINI = { [AI_PROVIDER_SETTING]: 'gemini', [AI_KEY_SETTING]: 'test-key' };

/** Gemini as the examiner: a question from the article it is given, then a verdict on the answer. */
function fakeExaminer(verdict: 'right' | 'partly' | 'wrong') {
  const bodies: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const raw = String(init.body);
      bodies.push(raw);
      const text = raw.includes('Ответ игрока')
        ? JSON.stringify({ verdict, feedback: 'Вы не назвали, кого это касается.' })
        : JSON.stringify({ question: 'Что считается кражей?', answer: 'Тайное хищение чужого имущества.' });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
    }),
  );
  return bodies;
}

const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });

async function openTrainer() {
  const app = await renderApp({ settings: GEMINI });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  await app.user.click(screen.getByRole('radio', { name: 'Тренажёр' }));
  return { ...app, view: screen.getByRole('region', { name: 'Тренажёр' }) };
}

describe('the exam trainer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks about a real article, checks the answer against it, counts the score and goes on', async () => {
    const bodies = fakeExaminer('partly');
    const { user, view } = await openTrainer();
    await user.click(within(view).getByRole('button', { name: 'Начать' }));
    expect(await within(view).findByText('Что считается кражей?')).toBeInTheDocument();
    // The question was made from an article of the server's laws, given whole to the AI.
    expect(bodies[0]).toMatch(/### УК ст\. /);

    await user.type(search(), 'когда берут чужое{Enter}');
    expect(await within(view).findByText('Почти верно.')).toBeInTheDocument();
    expect(within(view).getByText(/Вы не назвали, кого это касается/)).toBeInTheDocument();
    expect(within(view).getByText(/Полный ответ: Тайное хищение/)).toBeInTheDocument();
    expect(within(view).getByLabelText('Вопрос 1 из 10')).toHaveTextContent('верно 0,5');
    // The answer is checked against the same article the question came from.
    // The player's answer goes as fenced data, and the examiner starts from the same core rules as every mode.
    expect(bodies[1]).toContain('<<<\\nкогда берут чужое\\n>>>');
    expect(bodies[1]).toContain('Ты не источник законодательства');

    await user.click(within(view).getByRole('button', { name: 'Следующий вопрос' }));
    expect(await within(view).findByLabelText('Вопрос 2 из 10')).toBeInTheDocument();
  });

  it('asks about the organisation\'s laws by default, and never the same article twice in a round', () => {
    const police = TVERSKOI_PACK.organizations.find((o) => o.id === 'mvd')!;
    const own = defaultDocuments(TVERSKOI_PACK, police.documents);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((id) => police.documents.includes(id))).toBe(true);

    const uk = TVERSKOI_PACK.documents.filter((d) => d.id === 'uk');
    const asked = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const hit = pickArticle(uk, asked)!;
      expect(asked.has(hit.article.id)).toBe(false);
      expect(articleText(hit.article).length).toBeGreaterThanOrEqual(80);
      asked.add(hit.article.id);
    }
  });

  it('asks for the key before the first question', async () => {
    const { user } = await renderApp({ settings: { [AI_PROVIDER_SETTING]: 'gemini' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Тренажёр' }));
    await user.click(within(screen.getByRole('region', { name: 'Тренажёр' })).getByRole('button', { name: 'Начать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Сначала вставьте ключ Gemini');
  });
});
