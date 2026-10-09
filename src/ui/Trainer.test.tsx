import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TVERSKOI_PACK } from '../data/bundled';
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
  const app = await renderApp({ settings: GEMINI, profile: { organization: 'mvd' } });
  await app.user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
  await app.user.click(screen.getByRole('radio', { name: 'Практика' }));
  // The quick tasks come first; the AI's exam is beside them.
  await app.user.click(screen.getByRole('radio', { name: 'Экзамен с ИИ' }));
  return { ...app, view: screen.getByRole('region', { name: 'Практика' }) };
}

describe('the exam trainer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('picks the document to be asked about from the assistant’s own list, by mouse or keys', async () => {
    const { user, view } = await openTrainer();
    const choice = within(view).getByRole('combobox', { name: 'Документ для вопросов' });
    expect(choice).toHaveTextContent('законы вашей организации');
    expect(within(view).queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(choice);
    const list = within(view).getByRole('listbox', { name: 'Документ для вопросов' });
    expect(within(list).getAllByRole('option').length).toBe(TVERSKOI_PACK.documents.length + 1);
    await user.click(within(list).getByRole('option', { name: /^УК\s*Уголовный кодекс$/ }));
    expect(within(view).queryByRole('listbox')).not.toBeInTheDocument();
    expect(choice).toHaveTextContent('УК — Уголовный кодекс');

    // By keys: the list opens on the chosen one, ↓ and Enter take the next; Esc closes only the list.
    choice.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(choice).toHaveTextContent('КоАП');
    await user.keyboard('{ArrowDown}{Escape}');
    expect(within(view).queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Практика' })).toBeInTheDocument();
  });

  it('asks about a real article, checks the answer against it, counts the score and goes on', async () => {
    const bodies = fakeExaminer('partly');
    const { user, view } = await openTrainer();
    await user.click(within(view).getByRole('button', { name: 'Начать' }));
    expect(await within(view).findByText('Что считается кражей?')).toBeInTheDocument();
    // The question was made from an article of the server's laws, given whole to the AI.
    expect(bodies[0]).toMatch(/### \S+ (ст|п)\. /);

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
    const { user } = await renderApp({ settings: { [AI_PROVIDER_SETTING]: 'gemini' }, profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Практика' }));
    await user.click(screen.getByRole('radio', { name: 'Экзамен с ИИ' }));
    await user.click(within(screen.getByRole('region', { name: 'Практика' })).getByRole('button', { name: 'Начать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Сначала вставьте ключ Gemini');
  });
});

describe('the quick tasks, with no AI (roadmap 6А)', () => {
  it('come first in «Практика»: ten tasks from the laws, four answers each, the right one shown, the article to open', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Практика' }));
    const view = screen.getByRole('region', { name: 'Практика' });
    expect(within(view).getByRole('radio', { name: 'Быстрые задания' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(view).getByRole('button', { name: 'Начать' }));

    for (let n = 1; n <= 10; n++) {
      expect(within(view).getByLabelText(`Задание ${n} из 10`)).toBeInTheDocument();
      const answers = within(within(view).getByRole('group', { name: 'Варианты ответа' })).getAllByRole('button');
      expect(answers).toHaveLength(4);
      // The first answer, by its key: right or wrong, the verdict says which is right.
      await user.keyboard('1');
      expect(within(view).getByRole('status')).toHaveTextContent(/Верно\.|Неверно\. Правильно:/);
      expect(answers.every((a) => (a as HTMLButtonElement).disabled)).toBe(true);
      await user.click(within(view).getByRole('button', { name: n < 10 ? 'Следующее задание' : 'Итог' }));
    }
    expect(within(view).getByRole('status')).toHaveTextContent(/Результат: \d+ из 10/);
    expect(within(view).getByRole('button', { name: 'Пройти ещё раз' })).toBeInTheDocument();
    // No AI was asked: nothing went over the network.
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('opens the article a task was about', async () => {
    const { user } = await renderApp({ profile: { organization: 'mvd' } });
    await user.click(screen.getByRole('button', { name: 'ИИ-разбор ситуации' }));
    await user.click(screen.getByRole('radio', { name: 'Практика' }));
    const view = screen.getByRole('region', { name: 'Практика' });
    await user.click(within(view).getByRole('button', { name: 'Начать' }));
    await user.keyboard('2');
    const cite = within(within(view).getByRole('status')).getByRole('button');
    const name = cite.textContent ?? '';
    await user.click(cite);
    expect(await screen.findByRole('article')).toHaveAccessibleName(expect.stringContaining(name.split(' «')[0].split(' ').slice(-1)[0]));
  });
});
