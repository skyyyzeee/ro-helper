import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

type User = Awaited<ReturnType<typeof renderApp>>['user'];
const originalWidth = window.innerWidth;
const search = () => screen.getByRole('searchbox', { name: 'Поиск по законам' });
const reader = () => within(screen.getByRole('region', { name: 'Текст выбранной статьи' }));
function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}
afterEach(() => resize(originalWidth));
async function pick(user: User, name: RegExp) {
  await user.click(screen.getByRole('button', { name: 'Все документы' }));
  const catalogue = screen.getByRole('dialog', { name: 'Все документы' });
  await user.click(within(catalogue).getAllByRole('button', { name })[0]);
}

describe('reading a document beside its outline', () => {
  it('jumps to a chapter and steps by article rather than repeating punished parts', async () => {
    resize(1180);
    const { user } = await renderApp();
    await pick(user, /^УКУголовный кодекс/);
    expect(reader().getByRole('article')).toHaveAccessibleName(/^Статья 1\./);
    expect(screen.getByRole('button', { name: 'Предыдущая статья' })).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Перейти к главе' }), screen.getByRole('option', { name: /^Глава 19\./ }));
    expect(reader().getByRole('article')).toHaveAccessibleName(/^Статья 87\./);
    await user.click(screen.getByRole('button', { name: 'Следующая статья' }));
    expect(reader().getByRole('article')).toHaveAccessibleName(/^Статья 88\./);
    expect(screen.getByLabelText('Оглавление: Уголовный кодекс')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Предыдущая статья' }));
    expect(reader().getByRole('article')).toHaveAccessibleName(/^Статья 87\./);
  });

  it('keeps the selected article and outline position when opening it separately in a narrow window', async () => {
    resize(1180);
    const { user } = await renderApp();
    await pick(user, /^6-ФЗО полиции/);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Перейти к главе' }), screen.getByRole('option', { name: /^Глава 2\./ }));
    const outline = screen.getByLabelText('Оглавление: О полиции');
    outline.scrollTop = 314;
    fireEvent.scroll(outline);
    await act(() => resize(900));
    expect(screen.queryByRole('region', { name: 'Текст выбранной статьи' })).not.toBeInTheDocument();
    await user.click(within(outline).getByRole('button', { name: /ст\. 5\s*Соблюдение/ }));
    expect(screen.getByRole('article')).toHaveAccessibleName(/^Статья 5\./);
    await user.click(screen.getByRole('button', { name: 'Оглавление' }));
    expect(screen.getByLabelText('Оглавление: О полиции').scrollTop).toBe(314);
    expect(document.querySelector('.row--selected')).toHaveTextContent('ст. 5');
  });

  it('searches within the open document and returns to its outline when the query is cleared', async () => {
    resize(1180);
    const { user } = await renderApp();
    await pick(user, /^6-ФЗО полиции/);
    await user.type(search(), 'права');
    const results = screen.getByRole('list', { name: 'Результаты поиска' });
    expect(within(results).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(results).getAllByRole('listitem').every((item) => item.textContent?.includes('6-ФЗ'))).toBe(true);
    await user.clear(search());
    expect(screen.getByLabelText('Оглавление: О полиции')).toBeInTheDocument();
    expect(reader().getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /только в 6-ФЗ/ })).toBeInTheDocument();
  });
});

describe('outline navigation without a reading pane', () => {
  it('does not put an unseen article into recent history merely by selecting a chapter', async () => {
    resize(900);
    const { user, platform } = await renderApp();
    await pick(user, /^6-ФЗО полиции/);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Перейти к главе' }), screen.getByRole('option', { name: /^Глава 2\./ }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(platform.settings.get('recent:tverskoi') ?? []).toEqual([]);
    expect(document.querySelector('.row--selected')).toHaveTextContent('ст. 5');
  });
});
